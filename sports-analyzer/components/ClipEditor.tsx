"use client";
import React, { useState, useCallback, useMemo } from "react";
import { Scissors, Play, Square, Download, Check, ChevronDown, ChevronUp, Film, Filter } from "lucide-react";
import { getEventConfig } from "@/types";
import type { SportEvent } from "@/types";

// We import the handle type but don't import VideoPlayerHandle from VideoPlayer
// to avoid circular deps — we use a local compatible interface
interface PlayerHandle {
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
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
  const d = Math.max(0, end - start);
  return `${d.toFixed(1)}s`;
}

type FilterState = { tipo: string; subtype: string; result: string };

export default function ClipEditor({ events, playerRef, onUpdateClip }: ClipEditorProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingEnd, setSettingEnd] = useState<string | null>(null); // eventId being edited
  const [filter, setFilter] = useState<FilterState>({ tipo: "", subtype: "", result: "" });

  // Only events that have at least clip_start defined
  const clips = useMemo(() => {
    let list = events.filter(e => e.clip_start !== undefined);
    if (filter.tipo)    list = list.filter(e => e.tipo === filter.tipo);
    if (filter.subtype) list = list.filter(e => e.subtype === filter.subtype);
    if (filter.result)  list = list.filter(e => (e.result ?? e.resultado ?? null) === filter.result);
    return list;
  }, [events, filter]);

  const uniqueTipos = useMemo(() =>
    Array.from(new Set(events.map(e => e.tipo))), [events]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === clips.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(clips.map(e => e.id)));
    }
  };

  // Preview: seek to clip_start and play
  const handlePreview = useCallback((event: SportEvent) => {
    playerRef.current?.seekTo(event.clip_start ?? Math.max(0, event.time - 5));
  }, [playerRef]);

  // Start setting clip end for an event
  const handleSetEnd = useCallback((eventId: string, event: SportEvent) => {
    if (settingEnd === eventId) {
      // Confirm: capture current player time as clip_end
      const currentTime = playerRef.current?.getCurrentTime() ?? event.time;
      onUpdateClip(eventId, event.clip_start ?? Math.max(0, event.time - 5), currentTime);
      setSettingEnd(null);
    } else {
      // First click: seek to clip_start, enter "waiting for end" mode
      playerRef.current?.seekTo(event.clip_start ?? Math.max(0, event.time - 5));
      setSettingEnd(eventId);
    }
  }, [settingEnd, playerRef, onUpdateClip]);

  // Adjust clip_start manually
  const handleSetStart = useCallback((event: SportEvent) => {
    const currentTime = playerRef.current?.getCurrentTime() ?? event.time;
    onUpdateClip(event.id, currentTime, event.clip_end ?? event.time);
  }, [playerRef, onUpdateClip]);

  // Export selected clips as JSON
  const handleExport = useCallback(() => {
    const toExport = clips
      .filter(e => selected.has(e.id))
      .map(e => {
        const cfg = getEventConfig(e.tipo);
        return {
          id: e.id,
          tipo: e.tipo,
          subtype: e.subtype ?? null,
          result: e.result ?? e.resultado ?? null,
          player_name: e.player_name ?? null,
          timestamp: e.time,
          clip_start: e.clip_start ?? Math.max(0, e.time - 5),
          clip_end: e.clip_end ?? e.time,
          duration_seconds: Math.max(0, (e.clip_end ?? e.time) - (e.clip_start ?? Math.max(0, e.time - 5))),
          label: `${cfg.emoji} ${e.tipo}${e.subtype ? ` (${e.subtype})` : ""}${e.player_name ? ` — ${e.player_name}` : ""}`,
        };
      });

    const exportData = {
      exported_at: new Date().toISOString(),
      total_clips: toExport.length,
      clips: toExport,
      ffmpeg_commands: toExport.map((c, i) =>
        `ffmpeg -i INPUT.mp4 -ss ${c.clip_start.toFixed(2)} -to ${c.clip_end.toFixed(2)} -c copy clip_${String(i+1).padStart(2,"0")}_${c.tipo.replace(/\s+/g,"_")}.mp4`
      ),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clips_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [clips, selected]);

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

          {/* How it works */}
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/15 border border-violet-500/40 hover:bg-violet-500/25 rounded-lg text-violet-400 font-display font-bold tracking-widest text-xs transition-all">
                <Download className="w-3.5 h-3.5" />
                EXPORTAR {selected.size} CLIPS
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

                    {/* Row 1: checkbox + info */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleSelect(event.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${selected.has(event.id) ? "bg-violet-500 border-violet-500" : "border-[#30363d]"}`}>
                        {selected.has(event.id) && <Check className="w-2.5 h-2.5 text-white" />}
                      </button>

                      <span style={{fontSize:"1rem"}}>{cfg.emoji}</span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-display font-bold text-xs ${cfg.color}`}>
                            {event.tipo.toUpperCase()}
                          </span>
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
                          {event.player_name && (
                            <span className="text-xs font-mono text-cyan-400">👤 {event.player_name}</span>
                          )}
                        </div>
                      </div>

                      {/* Duration badge */}
                      <span className="text-xs font-mono text-[#484f58] bg-[#21262d] px-2 py-0.5 rounded shrink-0">
                        {duration(start, end)}
                      </span>
                    </div>

                    {/* Row 2: timeline bar */}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-emerald-400 tabular-nums w-14 shrink-0">{fmt(start)}</span>
                      <div className="flex-1 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500/60 rounded-full" style={{width:"100%"}} />
                      </div>
                      <span className="font-mono text-xs text-rose-400 tabular-nums w-14 text-right shrink-0">{fmt(end)}</span>
                    </div>

                    {/* Row 3: actions */}
                    <div className="flex gap-1.5 flex-wrap">
                      {/* Preview */}
                      <button onClick={() => handlePreview(event)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-[#21262d] border border-[#30363d] hover:border-[#484f58] rounded-lg text-[#8b949e] hover:text-white font-mono text-xs transition-all">
                        <Play className="w-3 h-3" /> Preview
                      </button>

                      {/* Set start to current */}
                      <button onClick={() => handleSetStart(event)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg text-emerald-400 font-mono text-xs transition-all"
                        title="Establece el inicio del clip en el tiempo actual del video">
                        ← INICIO AQUÍ
                      </button>

                      {/* Set end */}
                      {isEditingEnd ? (
                        <button onClick={() => handleSetEnd(event.id, event)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/15 border border-amber-500/50 rounded-lg text-amber-400 font-mono text-xs animate-pulse transition-all">
                          <Square className="w-3 h-3" /> ✓ CONFIRMAR FIN
                        </button>
                      ) : (
                        <button onClick={() => handleSetEnd(event.id, event)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 rounded-lg text-rose-400 font-mono text-xs transition-all"
                          title="Hace preview → reproducí hasta donde querés → confirmar fin">
                          FIN AQUÍ →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Export info */}
          {selected.size > 0 && (
            <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-xl">
              <p className="text-[#484f58] font-mono text-xs mb-1 uppercase tracking-widest">El JSON incluye:</p>
              <p className="text-[#8b949e] font-mono text-xs leading-relaxed">
                · Metadata de cada clip (tipo, subtipo, resultado, jugador)<br/>
                · clip_start y clip_end en segundos<br/>
                · Comandos FFmpeg listos para cortar el video
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
