"use client";
import React, { useState, useCallback, useMemo, useRef } from "react";
import { Scissors, Play, Square, Download, Check, ChevronDown, ChevronUp, Film, Filter, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { getEventConfig } from "@/types";
import type { SportEvent } from "@/types";

interface PlayerHandle {
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  getLocalFile?: () => File | null;
}

interface ClipEditorProps {
  events: SportEvent[];
  playerRef: React.RefObject<PlayerHandle>;
  onUpdateClip: (eventId: string, clip_start: number, clip_end: number) => void;
}

function fmt(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), ds = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${ds}`;
}
function duration(start: number, end: number) {
  return `${Math.max(0, end - start).toFixed(1)}s`;
}

type FilterState = { tipo: string; subtype: string; result: string };

// ─── FFmpeg loader (runs entirely in-browser, no external CDN) ───────────────
let ffmpegInstance: unknown = null;
let ffmpegLoading: Promise<unknown> | null = null;

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    // Files are copied from node_modules/@ffmpeg/core to /public/ffmpeg/ 
    // by scripts/copy-ffmpeg.js at build time (postinstall + build step)
    // This ensures they're always available on the same origin — no CORS issues
    await ff.load({
      coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
      wasmURL: await toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
    });
    ffmpegInstance = ff;
    return ff;
  })();

  return ffmpegLoading;
}

// Restore the public/ffmpeg files
export default function ClipEditor({ events, playerRef, onUpdateClip }: ClipEditorProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingEnd, setSettingEnd] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>({ tipo: "", subtype: "", result: "" });
  const [exportStatus, setExportStatus] = useState<"idle" | "loading-ffmpeg" | "exporting" | "done" | "error">("idle");
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const lastFileRef = useRef<File | null>(null);

  const clips = useMemo(() => {
    let list = events.filter(e => e.clip_start !== undefined);
    if (filter.tipo)    list = list.filter(e => e.tipo === filter.tipo);
    if (filter.subtype) list = list.filter(e => e.subtype === filter.subtype);
    if (filter.result)  list = list.filter(e => (e.result ?? e.resultado ?? null) === filter.result);
    return list;
  }, [events, filter]);

  const uniqueTipos = useMemo(() => Array.from(new Set(events.map(e => e.tipo))), [events]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === clips.length) setSelected(new Set());
    else setSelected(new Set(clips.map(e => e.id)));
  };

  const handlePreview = useCallback((event: SportEvent) => {
    playerRef.current?.seekTo(event.clip_start ?? Math.max(0, event.time - 5));
  }, [playerRef]);

  const handleSetEnd = useCallback((eventId: string, event: SportEvent) => {
    if (settingEnd === eventId) {
      const currentTime = playerRef.current?.getCurrentTime() ?? event.time;
      onUpdateClip(eventId, event.clip_start ?? Math.max(0, event.time - 5), currentTime);
      setSettingEnd(null);
    } else {
      playerRef.current?.seekTo(event.clip_start ?? Math.max(0, event.time - 5));
      setSettingEnd(eventId);
    }
  }, [settingEnd, playerRef, onUpdateClip]);

  const handleSetStart = useCallback((event: SportEvent) => {
    const currentTime = playerRef.current?.getCurrentTime() ?? event.time;
    onUpdateClip(event.id, currentTime, event.clip_end ?? event.time);
  }, [playerRef, onUpdateClip]);

  const handleExport = useCallback(async () => {
    const clipsToExport = clips
      .filter(e => selected.has(e.id))
      .map(e => {
        const cfg = getEventConfig(e.tipo);
        return {
          ...e,
          clip_start: e.clip_start ?? Math.max(0, e.time - 5),
          clip_end: e.clip_end ?? e.time,
          label: `${cfg.emoji} ${e.tipo}${e.subtype ? ` (${e.subtype})` : ""}${e.player_name ? ` — ${e.player_name}` : ""}`,
        };
      });

    const localFile = (playerRef.current as { getLocalFile?: () => File | null })?.getLocalFile?.();

    // No local file → export JSON with ffmpeg commands
    if (!localFile) {
      const exportData = {
        exported_at: new Date().toISOString(),
        total_clips: clipsToExport.length,
        clips: clipsToExport.map(c => ({
          id: c.id, tipo: c.tipo, subtype: c.subtype ?? null,
          result: c.result ?? c.resultado ?? null, player_name: c.player_name ?? null,
          timestamp: c.time, clip_start: c.clip_start, clip_end: c.clip_end,
          duration_seconds: Math.max(0, c.clip_end - c.clip_start), label: c.label,
        })),
        ffmpeg_commands: clipsToExport.map((c, i) =>
          `ffmpeg -i INPUT.mp4 -ss ${c.clip_start.toFixed(2)} -to ${c.clip_end.toFixed(2)} -c copy clip_${String(i+1).padStart(2,"0")}_${c.tipo.replace(/\s+/g,"_")}.mp4`
        ),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `clips_${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      return;
    }

    try {
      setExportError(null);

      // Load ffmpeg from /public/ffmpeg (self-hosted, no CORS, cached after first load)
      if (!ffmpegInstance) {
        setExportStatus("loading-ffmpeg");
        setExportProgress({ current: 0, total: clipsToExport.length, label: "Cargando FFmpeg (~30MB, solo la primera vez)..." });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ff = await getFFmpeg() as any;

      // Read file buffer (cache it if same file)
      setExportStatus("exporting");
      if (lastFileRef.current !== localFile || !fileBufferRef.current) {
        setExportProgress({ current: 0, total: clipsToExport.length, label: "Leyendo video..." });
        fileBufferRef.current = await localFile.arrayBuffer();
        lastFileRef.current = localFile;
        const ext = localFile.name.split(".").pop()?.toLowerCase() ?? "mp4";
        await ff.writeFile(`src.${ext}`, new Uint8Array(fileBufferRef.current));
      }

      const ext = localFile.name.split(".").pop()?.toLowerCase() ?? "mp4";
      const inputName = `src.${ext}`;

      for (let i = 0; i < clipsToExport.length; i++) {
        const clip = clipsToExport[i];
        const safeName = clip.tipo.replace(/[^a-zA-Z0-9]/g, "_");
        const outName = `clip_${String(i+1).padStart(2,"0")}_${safeName}.mp4`;
        setExportProgress({ current: i + 1, total: clipsToExport.length, label: clip.label });

        // -c copy para mp4/m4v, re-encode mínimo para mov (necesita remux)
        const needsRemux = ["mov", "avi", "mkv"].includes(ext);
        const args = needsRemux
          ? [
              "-ss", clip.clip_start.toFixed(3),
              "-to", clip.clip_end.toFixed(3),
              "-i", inputName,
              "-c:v", "copy",          // copia stream de video sin re-encode
              "-c:a", "aac",           // re-encode solo audio (mov usa pcm que mp4 no soporta)
              "-movflags", "+faststart",
              "-avoid_negative_ts", "make_zero",
              outName,
            ]
          : [
              "-ss", clip.clip_start.toFixed(3),
              "-to", clip.clip_end.toFixed(3),
              "-i", inputName,
              "-c", "copy",
              "-movflags", "+faststart",
              "-avoid_negative_ts", "make_zero",
              outName,
            ];

        await ff.exec(args);

        const data: Uint8Array | string = await ff.readFile(outName);
        const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
        const dlBlob = new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" });
        const url = URL.createObjectURL(dlBlob);
        const a = document.createElement("a");
        a.href = url; a.download = outName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        await ff.deleteFile(outName);
      }

      setExportStatus("done");
      setTimeout(() => setExportStatus("idle"), 4000);
    } catch (err: unknown) {
      console.error(err);
      setExportStatus("error");
      setExportError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setExportProgress(null);
    }
  }, [clips, selected, playerRef]);

  return (
    <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden">
      {/* Header */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#161b22] transition-colors">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-violet-400" />
          <span className="font-display font-semibold tracking-widest text-xs text-[#484f58] uppercase">
            Editor de Clips
          </span>
          <span className="text-xs font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
            {events.length} clips
          </span>
          {selected.size > 0 && (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              {selected.size} seleccionados
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#484f58]" /> : <ChevronDown className="w-4 h-4 text-[#484f58]" />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">

          {settingEnd && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl animate-slide-in">
              <span className="text-amber-400 text-lg">⏱</span>
              <div>
                <p className="text-amber-400 font-display font-bold text-xs tracking-wide">MODO AJUSTE DE FIN ACTIVO</p>
                <p className="text-[#8b949e] text-xs font-mono">Reproducí hasta donde querés que termine el clip → click en "✓ Confirmar fin"</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 flex-wrap items-center">
            <Filter className="w-3.5 h-3.5 text-[#484f58]" />
            <select value={filter.tipo} onChange={e => setFilter(f=>({...f, tipo:e.target.value}))}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-xs font-mono text-[#8b949e] focus:outline-none transition-colors">
              <option value="">Todos los tipos</option>
              {uniqueTipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filter.subtype} onChange={e => setFilter(f=>({...f, subtype:e.target.value}))}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-xs font-mono text-[#8b949e] focus:outline-none transition-colors">
              <option value="">OF + DEF</option>
              <option value="ofensivo">⚔️ Ofensivo</option>
              <option value="defensivo">🛡️ Defensivo</option>
            </select>
            <select value={filter.result} onChange={e => setFilter(f=>({...f, result:e.target.value}))}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-xs font-mono text-[#8b949e] focus:outline-none transition-colors">
              <option value="">OK + ERR</option>
              <option value="correcto">✓ Correcto</option>
              <option value="incorrecto">✗ Incorrecto</option>
            </select>
            {(filter.tipo || filter.subtype || filter.result) && (
              <button onClick={() => setFilter({tipo:"",subtype:"",result:""})}
                className="text-xs font-mono text-[#484f58] hover:text-white transition-colors">✕</button>
            )}
          </div>

          {/* Select all + export */}
          <div className="flex items-center justify-between">
            <button onClick={toggleAll}
              className="flex items-center gap-1.5 text-xs font-mono text-[#484f58] hover:text-white transition-colors">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected.size === clips.length && clips.length > 0 ? "bg-violet-500 border-violet-500" : "border-[#30363d]"}`}>
                {selected.size === clips.length && clips.length > 0 && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              {selected.size === clips.length && clips.length > 0 ? "Deseleccionar todo" : "Seleccionar todo"}
            </button>

            {selected.size > 0 && (
              <button onClick={handleExport}
                disabled={exportStatus === "loading-ffmpeg" || exportStatus === "exporting"}
                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg font-display font-bold tracking-widest text-xs transition-all
                  ${exportStatus === "done" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                  : exportStatus === "error" ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                  : exportStatus !== "idle" ? "bg-violet-500/10 border-violet-500/30 text-violet-300 cursor-wait opacity-75"
                  : "bg-violet-500/15 border-violet-500/40 hover:bg-violet-500/25 text-violet-400"}`}>
                {exportStatus === "loading-ffmpeg" || exportStatus === "exporting"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : exportStatus === "done" ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : exportStatus === "error" ? <AlertCircle className="w-3.5 h-3.5" />
                  : <Download className="w-3.5 h-3.5" />}
                {exportStatus === "loading-ffmpeg" ? "CARGANDO FFMPEG..."
                  : exportStatus === "exporting" ? `CORTANDO ${exportProgress?.current ?? 0}/${exportProgress?.total ?? 0}...`
                  : exportStatus === "done" ? "¡LISTO!"
                  : exportStatus === "error" ? "ERROR"
                  : `EXPORTAR ${selected.size} MP4${selected.size > 1 ? "s" : ""}`}
              </button>
            )}
          </div>

          {clips.length === 0 ? (
            <div className="text-center py-6 text-[#484f58] font-mono text-xs">
              <Film className="w-8 h-8 mx-auto mb-2 opacity-30" />
              {events.length === 0 ? "Marcá eventos para ver clips acá" : "Sin clips con estos filtros"}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto custom-scroll pr-1">
              {clips.map(event => {
                const cfg = getEventConfig(event.tipo);
                const start = event.clip_start ?? Math.max(0, event.time - 5);
                const end   = event.clip_end   ?? event.time;
                const isEditingEnd = settingEnd === event.id;
                const result = event.result ?? event.resultado ?? null;
                return (
                  <div key={event.id}
                    className={`flex flex-col gap-2 p-3 rounded-xl border transition-all ${isEditingEnd ? "border-amber-500/50 bg-amber-500/5" : "border-[#21262d] bg-[#161b22] hover:border-[#30363d]"}`}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleSelect(event.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${selected.has(event.id) ? "bg-violet-500 border-violet-500" : "border-[#30363d]"}`}>
                        {selected.has(event.id) && <Check className="w-2.5 h-2.5 text-white" />}
                      </button>
                      <span style={{fontSize:"1rem"}}>{cfg.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-display font-bold text-xs ${cfg.color}`}>{event.tipo.toUpperCase()}</span>
                          {event.subtype && (
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${event.subtype === "ofensivo" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-sky-500/10 border-sky-500/20 text-sky-400"}`}>
                              {event.subtype === "ofensivo" ? "⚔️ OF" : "🛡️ DEF"}
                            </span>
                          )}
                          {result && (
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${result === "correcto" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>
                              {result === "correcto" ? "✓ OK" : "✗ ERR"}
                            </span>
                          )}
                          {event.player_name && <span className="text-xs font-mono text-cyan-400">👤 {event.player_name}</span>}
                        </div>
                      </div>
                      <span className="text-xs font-mono text-[#484f58] bg-[#21262d] px-2 py-0.5 rounded shrink-0">{duration(start, end)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-emerald-400 tabular-nums w-14 shrink-0">{fmt(start)}</span>
                      <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500/60 rounded-full" style={{width:"100%"}} />
                      </div>
                      <span className="font-mono text-xs text-rose-400 tabular-nums w-14 text-right shrink-0">{fmt(end)}</span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => handlePreview(event)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-[#21262d] border border-[#30363d] hover:border-[#484f58] rounded-lg text-[#8b949e] hover:text-white font-mono text-xs transition-all">
                        <Play className="w-3 h-3" /> Preview
                      </button>
                      <button onClick={() => handleSetStart(event)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg text-emerald-400 font-mono text-xs transition-all">
                        ← INICIO AQUÍ
                      </button>
                      {isEditingEnd ? (
                        <button onClick={() => handleSetEnd(event.id, event)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/15 border border-amber-500/50 rounded-lg text-amber-400 font-mono text-xs animate-pulse transition-all">
                          <Square className="w-3 h-3" /> ✓ CONFIRMAR FIN
                        </button>
                      ) : (
                        <button onClick={() => handleSetEnd(event.id, event)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 rounded-lg text-rose-400 font-mono text-xs transition-all">
                          FIN AQUÍ →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Status */}
          {exportStatus === "error" && exportError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-rose-400 font-mono text-xs font-bold mb-0.5">Error al exportar</p>
                <p className="text-[#8b949e] font-mono text-xs">{exportError}</p>
              </div>
            </div>
          )}

          {(exportStatus === "loading-ffmpeg" || exportStatus === "exporting") && exportProgress && (
            <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                <p className="text-violet-400 font-mono text-xs truncate">{exportProgress.label}</p>
              </div>
              {exportStatus === "exporting" && exportProgress.total > 0 && (
                <div className="w-full h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }} />
                </div>
              )}
            </div>
          )}

          {selected.size > 0 && exportStatus === "idle" && (
            <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-xl">
              {(playerRef.current as { getLocalFile?: () => File | null })?.getLocalFile?.() ? (
                <>
                  <p className="text-[#484f58] font-mono text-xs mb-1 uppercase tracking-widest">Exportación MP4 — sin re-encode:</p>
                  <p className="text-[#8b949e] font-mono text-xs leading-relaxed">
                    · Usa ffmpeg con <span className="text-violet-400">-c copy</span>: corte instantáneo, calidad original<br/>
                    · Primera vez descarga FFmpeg (~30MB desde el servidor), después queda cacheado<br/>
                    · Cada clip se descarga como <span className="text-violet-400">.mp4</span> individual
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[#484f58] font-mono text-xs mb-1 uppercase tracking-widest">Sin video local — se exporta JSON:</p>
                  <p className="text-[#8b949e] font-mono text-xs leading-relaxed">
                    · Cargá un video local para exportar MP4 directamente<br/>
                    · El JSON incluye comandos FFmpeg listos para usar
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
