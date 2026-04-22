"use client";
import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  Scissors, Play, Square, Download, Check, ChevronDown, ChevronUp,
  Film, Filter, Loader2, AlertCircle, CheckCircle2, Combine,
} from "lucide-react";
import { getEventConfig } from "@/types";
import type { SportEvent } from "@/types";

interface PlayerHandle {
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  getLocalFile?: () => File | null;
  getAllFiles?: () => File[];
  getActiveFileIndex?: () => number;
}

interface ClipEditorProps {
  events: SportEvent[];
  playerRef: React.RefObject<PlayerHandle>;
  onUpdateClip: (eventId: string, clip_start: number, clip_end: number) => void;
  onEditClip?: (start: number, end: number) => void;
}

function fmt(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), ds = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${ds}`;
}
function duration(start: number, end: number) {
  return `${Math.max(0, end - start).toFixed(1)}s`;
}

type FilterState = { tipo: string; subtype: string; result: string };


// ─── MediaRecorder-based cutter (universal fallback for any video format) ────
// Works with MP4, MOV, WebM, etc. — plays the video at 1x speed and records
// only the requested range. Produces WebM output by default (or MP4 on Safari).
// Slower than copy-cutting but works without any WASM or SIMD.
async function cutWithMediaRecorder(
  sourceFile: File,
  clipStart: number,
  clipEnd: number,
  onProgress?: (pct: number) => void,
): Promise<{ data: Uint8Array; mime: string; ext: string }> {
  const url = URL.createObjectURL(sourceFile);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = false;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (video as any).playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo cargar el video"));
      setTimeout(() => reject(new Error("Timeout cargando video")), 15000);
    });

    let w = video.videoWidth || 1280;
    let h = video.videoHeight || 720;
    if (w < 64 || h < 64) {
      w = 1280;
      h = 720;
    }

    // Capture video frames via canvas + captureStream
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear contexto de canvas");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoStream = (canvas as any).captureStream(30) as MediaStream;

    // Try to capture audio from the video element
    let combinedStream = videoStream;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioStream = (video as any).captureStream?.() as MediaStream | undefined;
      if (audioStream) {
        const audioTracks = audioStream.getAudioTracks();
        if (audioTracks.length > 0) {
          combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...audioTracks,
          ]);
        }
      }
    } catch { /* ignore — export without audio */ }

    // Pick best available MIME type
    const candidates = [
      "video/mp4;codecs=avc1",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    let mimeType = "";
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
    }
    if (!mimeType) throw new Error("MediaRecorder no soporta ningún formato de video");

    const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";

    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 5_000_000, // 5 Mbps — decent quality
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const clipDuration = clipEnd - clipStart;

    // Seek to start and wait for ready
    video.currentTime = clipStart;
    await new Promise<void>((resolve) => {
      const handler = () => { video.removeEventListener("seeked", handler); resolve(); };
      video.addEventListener("seeked", handler);
    });

    recorder.start(200);
    video.play().catch(() => {});

    // Draw frames from video to canvas while playing
    let rafId = 0;
    const draw = () => {
      if (video.ended || video.currentTime >= clipEnd) return;
      ctx.drawImage(video, 0, 0, w, h);
      const pct = Math.min(100, Math.round(((video.currentTime - clipStart) / clipDuration) * 100));
      onProgress?.(pct);
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    // Stop when we reach clipEnd
    await new Promise<void>((resolve) => {
      const check = () => {
        if (video.currentTime >= clipEnd || video.ended) {
          video.pause();
          cancelAnimationFrame(rafId);
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    // Stop recorder and wait for final chunk
    const recordedBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.stop();
    });

    const arrayBuf = await recordedBlob.arrayBuffer();
    return { data: new Uint8Array(arrayBuf), mime: mimeType, ext };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─── Unified cutter ──────────────────────────────────────────────────────────
// Strategy: use MediaRecorder (works everywhere, no WASM issues).
// Output is WebM or MP4 depending on browser support — CapCut, Premiere,
// DaVinci, and most editors accept both.
async function cutClipUniversal(
  sourceFile: File,
  clipStart: number,
  clipEnd: number,
  onProgress?: (pct: number) => void,
): Promise<{ data: Uint8Array; ext: string }> {
  const result = await cutWithMediaRecorder(sourceFile, clipStart, clipEnd, onProgress);
  return { data: result.data, ext: result.ext };
}

// ─── Concat multiple clips into one video ────────────────────────────────────
// For same-source clips, we concatenate the WebM/MP4 files produced by
// MediaRecorder. WebM concat is trivial (just concat bytes — browsers handle
// the container), MP4 concat is more complex but we use a simple approach:
// record them back-to-back into a single MediaRecorder session.
async function compileClipsUniversal(
  clips: Array<{ file: File; start: number; end: number }>,
  onProgress?: (overallPct: number, label: string) => void,
): Promise<{ data: Uint8Array; ext: string }> {
  if (clips.length === 0) throw new Error("No hay clips para compilar");
  if (clips.length === 1) {
    const r = await cutClipUniversal(clips[0].file, clips[0].start, clips[0].end, p => onProgress?.(p, "Cortando clip..."));
    return r;
  }

  // Multi-clip compile: record each clip sequentially into the SAME MediaRecorder
  // by swapping video sources and canvas streams. We use a persistent canvas.
  const w = 1280, h = 720; // target dimensions — we'll scale to fit
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear contexto");

  // Use first clip to determine dimensions
  const firstClip = clips[0];
  const firstUrl = URL.createObjectURL(firstClip.file);
  const probeVideo = document.createElement("video");
  probeVideo.src = firstUrl;
  probeVideo.muted = true;
  await new Promise<void>((resolve, reject) => {
    probeVideo.onloadedmetadata = () => resolve();
    probeVideo.onerror = () => reject(new Error("No se pudo leer el primer clip"));
    setTimeout(() => reject(new Error("Timeout")), 10000);
  });
  canvas.width  = probeVideo.videoWidth  || w;
  canvas.height = probeVideo.videoHeight || h;
  URL.revokeObjectURL(firstUrl);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoStream = (canvas as any).captureStream(30) as MediaStream;

  const candidates = [
    "video/mp4;codecs=avc1",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  let mimeType = "";
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
  }
  if (!mimeType) throw new Error("MediaRecorder no soporta video");
  const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";

  const recorder = new MediaRecorder(videoStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(200);

  const totalDuration = clips.reduce((a, c) => a + (c.end - c.start), 0);
  let elapsedDuration = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipDur = clip.end - clip.start;
    const label = `Clip ${i + 1}/${clips.length}`;

    const url = URL.createObjectURL(clip.file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true; // audio mixing across clips is complex — skip for multi-clip
    video.crossOrigin = "anonymous";

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error(`Clip ${i+1} no carga`));
        setTimeout(() => reject(new Error(`Clip ${i+1} timeout`)), 15000);
      });

      video.currentTime = clip.start;
      await new Promise<void>((resolve) => {
        const h = () => { video.removeEventListener("seeked", h); resolve(); };
        video.addEventListener("seeked", h);
      });

      video.play().catch(() => {});

      let rafId = 0;
      const draw = () => {
        if (video.currentTime >= clip.end || video.ended) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const localPct = Math.min(1, (video.currentTime - clip.start) / clipDur);
        const overallPct = Math.round(((elapsedDuration + localPct * clipDur) / totalDuration) * 100);
        onProgress?.(overallPct, label);
        rafId = requestAnimationFrame(draw);
      };
      rafId = requestAnimationFrame(draw);

      await new Promise<void>((resolve) => {
        const check = () => {
          if (video.currentTime >= clip.end || video.ended) {
            video.pause();
            cancelAnimationFrame(rafId);
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });

      elapsedDuration += clipDur;
    } finally {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
    }
  }

  const recordedBlob = await new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.stop();
  });

  const arrayBuf = await recordedBlob.arrayBuffer();
  return { data: new Uint8Array(arrayBuf), ext };
}

export default function ClipEditor({ events, playerRef, onUpdateClip, onEditClip }: ClipEditorProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingEnd, setSettingEnd] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>({ tipo: "", subtype: "", result: "" });
  const [exportStatus, setExportStatus] = useState<"idle"|"loading-ffmpeg"|"exporting"|"compiling"|"done"|"error">("idle");
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [wasmPct, setWasmPct] = useState(0);
  const [clipErrors, setClipErrors] = useState<string[]>([]);
  const abortRef = useRef(false);

  const clips = useMemo(() => {
    let list = events.filter(e => e.clip_start !== undefined);
    if (filter.tipo)    list = list.filter(e => e.tipo === filter.tipo);
    if (filter.subtype) list = list.filter(e => e.subtype === filter.subtype);
    if (filter.result)  list = list.filter(e => (e.result ?? e.resultado ?? null) === filter.result);
    return list;
  }, [events, filter]);

  const uniqueTipos = useMemo(() => Array.from(new Set(events.map(e => e.tipo))), [events]);

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => { if (selected.size === clips.length) setSelected(new Set()); else setSelected(new Set(clips.map(e => e.id))); };

  const handlePreview = useCallback((event: SportEvent) => {
    playerRef.current?.seekTo(event.clip_start ?? Math.max(0, event.time - 5));
  }, [playerRef]);

  const handleSetEnd = useCallback((eventId: string, event: SportEvent) => {
    if (settingEnd === eventId) {
      const t = playerRef.current?.getCurrentTime() ?? event.time;
      onUpdateClip(eventId, event.clip_start ?? Math.max(0, event.time - 5), t);
      setSettingEnd(null);
    } else {
      playerRef.current?.seekTo(event.clip_start ?? Math.max(0, event.time - 5));
      setSettingEnd(eventId);
    }
  }, [settingEnd, playerRef, onUpdateClip]);

  const handleSetStart = useCallback((event: SportEvent) => {
    const t = playerRef.current?.getCurrentTime() ?? event.time;
    onUpdateClip(event.id, t, event.clip_end ?? event.time);
  }, [playerRef, onUpdateClip]);

  // ── Build clip list for export ────────────────────────────────────────────
  const buildClipsToExport = useCallback(() => {
    return clips
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
  }, [clips, selected]);

  // ── Resolve source file for a clip ───────────────────────────────────────
  const resolveFile = useCallback((videoFileIndex: number | undefined): File | null => {
    const allFiles = (playerRef.current as { getAllFiles?: () => File[] })?.getAllFiles?.() ?? [];
    const localFile = (playerRef.current as { getLocalFile?: () => File | null })?.getLocalFile?.();
    if (allFiles.length > 0) return allFiles[videoFileIndex ?? 0] ?? allFiles[0];
    return localFile ?? null;
  }, [playerRef]);

  // ── Export: individual clips (MediaRecorder — works anywhere) ─────────────
  const handleExportIndividual = useCallback(async () => {
    const clipsToExport = buildClipsToExport();
    const localFile = resolveFile(0);

    // No local file → export JSON
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
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `clips_${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      return;
    }

    try {
      setExportError(null); setClipErrors([]); abortRef.current = false;
      setExportStatus("exporting");
      setWasmPct(0);

      const errors: string[] = [];

      for (let i = 0; i < clipsToExport.length; i++) {
        if (abortRef.current) break;
        const clip = clipsToExport[i];
        const sourceFile = resolveFile(clip.videoFileIndex) ?? localFile;
        const safeName = clip.tipo.replace(/[^a-zA-Z0-9]/g, "_");

        setExportProgress({ current: i + 1, total: clipsToExport.length, label: clip.label });

        try {
          const result = await cutClipUniversal(sourceFile, clip.clip_start, clip.clip_end, pct => setWasmPct(pct));
          const outName = `clip_${String(i+1).padStart(2,"0")}_${safeName}.${result.ext}`;
          const mimeType = result.ext === "mp4" ? "video/mp4" : "video/webm";

          await new Promise<void>((resolve) => {
            const url = URL.createObjectURL(new Blob([result.data.buffer as ArrayBuffer], { type: mimeType }));
            const a = document.createElement("a");
            a.href = url; a.download = outName; a.style.display = "none";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 800);
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "error desconocido";
          console.error(`Clip ${i+1} falló:`, msg);
          errors.push(`Clip ${i+1} (${clip.label}): ${msg}`);
        }
      }

      setClipErrors(errors);
      setExportStatus(errors.length === clipsToExport.length ? "error" : "done");
      if (errors.length > 0 && errors.length < clipsToExport.length) {
        setExportError(`${errors.length} clip(s) fallaron, el resto se exportó correctamente.`);
      } else if (errors.length === clipsToExport.length) {
        setExportError("Todos los clips fallaron.");
      }
      setTimeout(() => { setExportStatus("idle"); setExportProgress(null); }, 5000);
    } catch (err: unknown) {
      console.error(err);
      setExportStatus("error");
      setExportError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setExportProgress(null);
    }
  }, [buildClipsToExport, resolveFile]);

  // ── Export: compile all selected clips into one video ─────────────────────
  const handleCompile = useCallback(async () => {
    const clipsToExport = buildClipsToExport();
    const localFile = resolveFile(0);

    if (!localFile) {
      alert("Necesitás cargar un video local para compilar.");
      return;
    }
    if (clipsToExport.length < 1) return;

    try {
      setExportError(null); setClipErrors([]); abortRef.current = false;
      setExportStatus("compiling");
      setWasmPct(0);

      const clipsForCompile = clipsToExport.map(c => ({
        file: resolveFile(c.videoFileIndex) ?? localFile,
        start: c.clip_start,
        end: c.clip_end,
      }));

      setExportProgress({
        current: 1,
        total: clipsToExport.length,
        label: `Compilando ${clipsToExport.length} clips...`,
      });

      const result = await compileClipsUniversal(clipsForCompile, (pct, label) => {
        setWasmPct(pct);
        setExportProgress({ current: 1, total: clipsToExport.length, label });
      });

      const mimeType = result.ext === "mp4" ? "video/mp4" : "video/webm";
      const blob = new Blob([result.data.buffer as ArrayBuffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compilado_${new Date().toISOString().slice(0,10)}.${result.ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      setExportStatus("done");
      setTimeout(() => { setExportStatus("idle"); setExportProgress(null); }, 5000);
    } catch (err: unknown) {
      console.error(err);
      setExportStatus("error");
      setExportError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setExportProgress(null);
    }
  }, [buildClipsToExport, resolveFile]);

  const isBusy = exportStatus === "loading-ffmpeg" || exportStatus === "exporting" || exportStatus === "compiling";
  const hasLocalFile = !!(playerRef.current as { getLocalFile?: () => File | null })?.getLocalFile?.();

  return (
    <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden">
      {/* Header */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#161b22] transition-colors">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-violet-400" />
          <span className="font-display font-semibold tracking-widest text-xs text-[#484f58] uppercase">Editor de Clips</span>
          <span className="text-xs font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">{events.length} clips</span>
          {selected.size > 0 && <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">{selected.size} seleccionados</span>}
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
                <p className="text-[#8b949e] text-xs font-mono">Reproducí hasta donde querés → click en "✓ Confirmar fin"</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 flex-wrap items-center">
            <Filter className="w-3.5 h-3.5 text-[#484f58]" />
            <select value={filter.tipo} onChange={e => setFilter(f=>({...f,tipo:e.target.value}))}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-xs font-mono text-[#8b949e] focus:outline-none transition-colors">
              <option value="">Todos los tipos</option>
              {uniqueTipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filter.subtype} onChange={e => setFilter(f=>({...f,subtype:e.target.value}))}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-xs font-mono text-[#8b949e] focus:outline-none transition-colors">
              <option value="">OF + DEF</option>
              <option value="ofensivo">⚔️ Ofensivo</option>
              <option value="defensivo">🛡️ Defensivo</option>
            </select>
            <select value={filter.result} onChange={e => setFilter(f=>({...f,result:e.target.value}))}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-xs font-mono text-[#8b949e] focus:outline-none transition-colors">
              <option value="">OK + ERR</option>
              <option value="correcto">✓ Correcto</option>
              <option value="incorrecto">✗ Incorrecto</option>
            </select>
            {(filter.tipo || filter.subtype || filter.result) && (
              <button onClick={() => setFilter({tipo:"",subtype:"",result:""})} className="text-xs font-mono text-[#484f58] hover:text-white transition-colors">✕</button>
            )}
          </div>

          {/* Select all + export buttons */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button onClick={toggleAll}
              className="flex items-center gap-1.5 text-xs font-mono text-[#484f58] hover:text-white transition-colors">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected.size===clips.length&&clips.length>0?"bg-violet-500 border-violet-500":"border-[#30363d]"}`}>
                {selected.size===clips.length&&clips.length>0&&<Check className="w-2.5 h-2.5 text-white" />}
              </div>
              {selected.size===clips.length&&clips.length>0?"Deseleccionar todo":"Seleccionar todo"}
            </button>

            {selected.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Individual download button */}
                <button onClick={handleExportIndividual} disabled={isBusy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg font-display font-bold tracking-widest text-xs transition-all
                    ${exportStatus==="done"?"bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                    :exportStatus==="error"?"bg-rose-500/15 border-rose-500/40 text-rose-400"
                    :isBusy?"bg-violet-500/10 border-violet-500/30 text-violet-300 cursor-wait opacity-75"
                    :"bg-violet-500/15 border-violet-500/40 hover:bg-violet-500/25 text-violet-400"}`}>
                  {isBusy&&exportStatus!=="compiling"?<Loader2 className="w-3.5 h-3.5 animate-spin" />
                    :exportStatus==="done"?<CheckCircle2 className="w-3.5 h-3.5" />
                    :exportStatus==="error"?<AlertCircle className="w-3.5 h-3.5" />
                    :<Download className="w-3.5 h-3.5" />}
                  {exportStatus==="loading-ffmpeg"?"CARGANDO..."
                    :isBusy&&exportStatus!=="compiling"?`${exportProgress?.current??0}/${exportProgress?.total??0}`
                    :exportStatus==="done"?"¡LISTO!"
                    :exportStatus==="error"?"ERROR"
                    :`${selected.size} VIDEO${selected.size>1?"S":""}`}
                </button>

                {/* Compile into 1 video button */}
                <button onClick={handleCompile} disabled={isBusy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg font-display font-bold tracking-widest text-xs transition-all
                    ${exportStatus==="compiling"?"bg-amber-500/10 border-amber-500/30 text-amber-300 cursor-wait opacity-75"
                    :isBusy?"bg-amber-500/10 border-amber-500/30 text-amber-300 cursor-wait opacity-75"
                    :"bg-amber-500/15 border-amber-500/40 hover:bg-amber-500/25 text-amber-400"}`}>
                  {exportStatus==="compiling"?<Loader2 className="w-3.5 h-3.5 animate-spin" />:<Combine className="w-3.5 h-3.5" />}
                  {exportStatus==="compiling"?"COMPILANDO...":"COMPILAR EN 1 VIDEO"}
                </button>
              </div>
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
                const fileIdx = event.videoFileIndex ?? 0;
                const allFiles = (playerRef.current as { getAllFiles?: () => File[] })?.getAllFiles?.() ?? [];
                const hasMultipleFiles = allFiles.length > 1;
                return (
                  <div key={event.id}
                    className={`flex flex-col gap-2 p-3 rounded-xl border transition-all ${isEditingEnd?"border-amber-500/50 bg-amber-500/5":"border-[#21262d] bg-[#161b22] hover:border-[#30363d]"}`}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleSelect(event.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${selected.has(event.id)?"bg-violet-500 border-violet-500":"border-[#30363d]"}`}>
                        {selected.has(event.id) && <Check className="w-2.5 h-2.5 text-white" />}
                      </button>
                      <span style={{fontSize:"1rem"}}>{cfg.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-display font-bold text-xs ${cfg.color}`}>{event.tipo.toUpperCase()}</span>
                          {hasMultipleFiles && (
                            <span className="text-[10px] font-mono px-1 py-0.5 rounded border border-violet-500/20 bg-violet-500/10 text-violet-400">
                              V{fileIdx+1}
                            </span>
                          )}
                          {event.subtype && (
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${event.subtype==="ofensivo"?"bg-emerald-500/10 border-emerald-500/20 text-emerald-400":"bg-sky-500/10 border-sky-500/20 text-sky-400"}`}>
                              {event.subtype==="ofensivo"?"⚔️ OF":"🛡️ DEF"}
                            </span>
                          )}
                          {result && (
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${result==="correcto"?"bg-green-500/10 border-green-500/20 text-green-400":"bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>
                              {result==="correcto"?"✓ OK":"✗ ERR"}
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
                      <button onClick={() => handlePreview(event)} className="flex items-center gap-1 px-2.5 py-1 bg-[#21262d] border border-[#30363d] hover:border-[#484f58] rounded-lg text-[#8b949e] hover:text-white font-mono text-xs transition-all">
                        <Play className="w-3 h-3" /> Preview
                      </button>
                      <button onClick={() => handleSetStart(event)} className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg text-emerald-400 font-mono text-xs transition-all">
                        ← INICIO AQUÍ
                      </button>
                      {isEditingEnd ? (
                        <button onClick={() => handleSetEnd(event.id, event)} className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/15 border border-amber-500/50 rounded-lg text-amber-400 font-mono text-xs animate-pulse transition-all">
                          <Square className="w-3 h-3" /> ✓ CONFIRMAR FIN
                        </button>
                      ) : (
                        <button onClick={() => handleSetEnd(event.id, event)} className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 rounded-lg text-rose-400 font-mono text-xs transition-all">
                          FIN AQUÍ →
                        </button>
                      )}
                      {onEditClip && (
                        <button onClick={() => onEditClip(start, end)} className="flex items-center gap-1 px-2.5 py-1 bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20 rounded-lg text-violet-400 font-mono text-xs transition-all">
                          ✏️ Editar clip
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Status: error details */}
          {exportStatus === "error" && exportError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-rose-400 font-mono text-xs font-bold mb-0.5">Error al exportar</p>
                <p className="text-[#8b949e] font-mono text-xs">{exportError}</p>
                {clipErrors.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {clipErrors.map((e, i) => <li key={i} className="text-[#484f58] font-mono text-xs">· {e}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Status: partial success with some clip errors */}
          {exportStatus === "done" && exportError && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-400 font-mono text-xs">{exportError}</p>
            </div>
          )}

          {/* Progress bar */}
          {(exportStatus==="loading-ffmpeg"||exportStatus==="exporting"||exportStatus==="compiling") && exportProgress && (
            <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin shrink-0" />
                  <p className="text-violet-400 font-mono text-xs truncate">
                    {exportStatus==="loading-ffmpeg"?`Procesando... ${wasmPct}%`:exportProgress.label}
                  </p>
                </div>
                {exportStatus==="loading-ffmpeg"&&<span className="text-violet-300 font-mono text-xs shrink-0">{wasmPct}%</span>}
              </div>
              <div className="w-full h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all duration-200"
                  style={{width: exportStatus==="loading-ffmpeg"?`${wasmPct}%`:`${(exportProgress.current/exportProgress.total)*100}%`}} />
              </div>
              {exportStatus==="loading-ffmpeg"&&<p className="text-[#484f58] font-mono text-xs mt-1.5">Procesamiento en el navegador · puede tardar unos segundos</p>}
              {exportStatus==="compiling"&&<p className="text-[#484f58] font-mono text-xs mt-1.5">Grabando clips en tiempo real...</p>}
            </div>
          )}

          {/* Info box when idle */}
          {selected.size > 0 && exportStatus === "idle" && (
            <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-xl">
              {hasLocalFile ? (
                <>
                  <p className="text-[#484f58] font-mono text-xs mb-1.5 uppercase tracking-widest">Opciones de exportación:</p>
                  <div className="flex flex-col gap-1">
                    <p className="text-[#8b949e] font-mono text-xs">
                      <span className="text-violet-400">Videos individuales</span> — descarga cada clip por separado
                    </p>
                    <p className="text-[#8b949e] font-mono text-xs">
                      <span className="text-amber-400">Compilar en 1 video</span> — une todos los clips seleccionados
                    </p>
                    <p className="text-[#484f58] font-mono text-xs mt-1">
                      Compatible con CapCut, Premiere, DaVinci y cualquier editor
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[#484f58] font-mono text-xs mb-1 uppercase tracking-widest">Sin video local — se exporta JSON:</p>
                  <p className="text-[#8b949e] font-mono text-xs">Cargá un video local para exportar video directamente</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
