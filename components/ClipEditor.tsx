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
  open?: boolean;
  setOpen?: (val: boolean) => void;
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

export default function ClipEditor({ events, playerRef, onUpdateClip, onEditClip, open: externalOpen, setOpen: externalSetOpen }: ClipEditorProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : true; // Always visible
  const setOpen = externalSetOpen || setLocalOpen;
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
    <div className="w-full bg-gradient-to-t from-[#0a0e27] via-[#0f1629] to-[#161e3a] border-t border-[#2a3a5a] rounded-t-xl">
      {/* Bottom panel — CapCut style */}
      <div className="w-full">
        
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-[#2a3a5a] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-[#2a3a5a]">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-cyan-400" />
            <div>
              <p className="text-white font-semibold text-sm">Clips seleccionados</p>
              <p className="text-[#8b9dc3] text-xs">{selected.size} de {events.length}</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-[#8b9dc3] hover:text-white transition-colors p-2">✕</button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 flex gap-2 flex-wrap border-b border-[#2a3a5a]">
          <select value={filter.tipo} onChange={e => setFilter(f=>({...f,tipo:e.target.value}))}
            className="bg-[#1a2847] border border-[#2a3a5a] rounded-lg px-3 py-1.5 text-xs font-mono text-[#8b9dc3] focus:outline-none focus:border-cyan-500 transition-colors hover:border-[#3a4a7a]">
            <option value="">Todos</option>
            {uniqueTipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filter.subtype} onChange={e => setFilter(f=>({...f,subtype:e.target.value}))}
            className="bg-[#1a2847] border border-[#2a3a5a] rounded-lg px-3 py-1.5 text-xs font-mono text-[#8b9dc3] focus:outline-none focus:border-cyan-500 transition-colors hover:border-[#3a4a7a]">
            <option value="">OF + DEF</option>
            <option value="ofensivo">⚔️ Ofensivo</option>
            <option value="defensivo">🛡️ Defensivo</option>
          </select>
          <select value={filter.result} onChange={e => setFilter(f=>({...f,result:e.target.value}))}
            className="bg-[#1a2847] border border-[#2a3a5a] rounded-lg px-3 py-1.5 text-xs font-mono text-[#8b9dc3] focus:outline-none focus:border-cyan-500 transition-colors hover:border-[#3a4a7a]">
            <option value="">OK + ERR</option>
            <option value="correcto">✓ OK</option>
            <option value="incorrecto">✗ ERR</option>
          </select>
        </div>

        {/* Clips list — compact cards */}
        <div className="px-5 py-3 max-h-[45vh] overflow-y-auto space-y-2 border-b border-[#2a3a5a]">
          {clips.length === 0 ? (
            <div className="text-center py-8 text-[#8b9dc3]">
              <p className="text-xs">Sin clips que mostrar</p>
            </div>
          ) : (
            clips.map(ev => (
              <div key={ev.id} className={`group p-3 rounded-lg border transition-all cursor-pointer ${
                selected.has(ev.id)
                  ? "bg-cyan-500/15 border-cyan-500/50"
                  : "bg-[#1a2847]/50 border-[#2a3a5a] hover:border-[#3a5a7a]"
              }`}
              onClick={() => {
                const newSelected = new Set(selected);
                if (newSelected.has(ev.id)) newSelected.delete(ev.id);
                else newSelected.add(ev.id);
                setSelected(newSelected);
              }}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected.has(ev.id)} onChange={() => {}} 
                    className="mt-1 w-4 h-4 rounded accent-cyan-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-xs truncate">`${ev.tipo}${ev.subtype ? " - " + ev.subtype : ""}`</p>
                    <p className="text-[#8b9dc3] text-xs mt-0.5">
                      <span className="font-mono">{fmt(ev.clip_start)}</span>
                      <span className="mx-1">→</span>
                      <span className="font-mono">{fmt(ev.clip_end)}</span>
                      <span className="ml-2 text-cyan-400">{duration(ev.clip_start, ev.clip_end)}</span>
                    </p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); playerRef.current?.seekTo(ev.clip_start); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-[#2a3a5a] rounded">
                    <Play className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Export buttons */}
        <div className="px-5 py-4 flex gap-2 justify-end border-b border-[#2a3a5a]">
          {exportStatus === "idle" && (
            <>
              <button onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-[#8b9dc3] hover:text-white hover:bg-[#2a3a5a] transition-colors">
                Cancelar
              </button>
              <button onClick={handleExportIndividual} disabled={selected.size === 0 || isBusy}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors">
                ↓ Descargar {selected.size} clip{selected.size!==1?"s":""}
              </button>
              {hasLocalFile && (
                <button onClick={handleCompile} disabled={selected.size === 0 || isBusy}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors">
                  ⧈ Compilar en 1 video
                </button>
              )}
            </>
          )}
          {exportStatus === "exporting" && (
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{exportProgress?.current}/{exportProgress?.total} clips...</span>
            </div>
          )}
          {exportStatus === "compiling" && (
            <div className="flex items-center gap-2 text-amber-400 text-xs font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Compilando...</span>
            </div>
          )}
          {exportStatus === "done" && (
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              Listo
            </div>
          )}
          {exportStatus === "error" && (
            <div className="flex items-center gap-2 text-red-400 text-xs font-semibold">
              <AlertCircle className="w-4 h-4" />
              Error
            </div>
          )}
        </div>

        {/* Progress bar */}
        {exportStatus !== "idle" && (
          <div className="px-5 py-2 bg-[#1a2847]">
            <div className="w-full h-1 bg-[#2a3a5a] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all" 
                style={{width: `${wasmPct}%`}} />
            </div>
          </div>
        )}

        {/* Error message */}
        {exportError && (
          <div className="px-5 py-3 bg-red-900/20 border-t border-red-500/30 flex gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-300">{exportError}</div>
          </div>
        )}
      </div>
    </div>
  );
}
