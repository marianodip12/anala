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

// ─── FFmpeg Core — runs directly in main thread, no Worker, no SharedArrayBuffer ──
// Two paths are supported:
//   Path A (primary):  @ffmpeg/core@0.12.6 — fast, requires WebAssembly SIMD
//   Path B (fallback): @ffmpeg/ffmpeg@0.11.6 wrapper — slower, no SIMD needed
// We try A first; on CompileError (SIMD unsupported) we switch to B permanently.

let wasmBin: ArrayBuffer | null = null;
let coreJsInjected = false;
let loadingPromise: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FFmpegWrapper = any;
let fallbackFFmpeg: FFmpegWrapper | null = null;
let fallbackLoadingPromise: Promise<void> | null = null;
let useFallback = false; // set to true once SIMD path fails

declare global {
  interface Window {
    createFFmpegCore?: (cfg: Record<string, unknown>) => Promise<unknown>;
    FFmpeg?: { createFFmpeg: (opts: Record<string, unknown>) => FFmpegWrapper; fetchFile?: (f: File|Blob|ArrayBuffer) => Promise<Uint8Array> };
  }
}

// @ffmpeg/core@0.12.6 (SIMD, fast) — primary path
const LOCAL_FFMPEG = { js: "/ffmpeg/ffmpeg-core.js", wasm: "/ffmpeg/ffmpeg-core.wasm" };
const CDN_COMPAT = {
  js:   "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
  wasm: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
};

// @ffmpeg/ffmpeg@0.11.6 wrapper (non-SIMD, Emscripten) — fallback path
const FALLBACK_WRAPPER_JS = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js";
const FALLBACK_CORE_PATH  = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.10.0/dist";

function resetFFmpegState() {
  wasmBin = null;
  coreJsInjected = false;
  loadingPromise = null;
}

async function fetchWithProgress(url: string, onProgress?: (pct: number) => void, startPct = 0, endPct = 100): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.length;
    if (total > 0 && onProgress) onProgress(startPct + Math.round((loaded / total) * (endPct - startPct)));
  }
  const buf = new Uint8Array(loaded); let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return buf.buffer as ArrayBuffer;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Error al cargar script: ${src}`));
    document.head.appendChild(s);
  });
}

// ── Path A: 0.12.x (SIMD) ────────────────────────────────────────────────────
async function ensureFFmpegLoaded(onProgress?: (pct: number) => void): Promise<void> {
  if (wasmBin && coreJsInjected) { onProgress?.(100); return; }
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    onProgress?.(0);
    const tryUrls = [LOCAL_FFMPEG, CDN_COMPAT];
    let lastErr: unknown = null;
    let jsText: string | null = null;
    let ok = false;

    for (const urls of tryUrls) {
      try {
        const jsRes = await fetch(urls.js);
        if (!jsRes.ok) throw new Error(`HTTP ${jsRes.status}`);
        jsText = await jsRes.text();
        onProgress?.(10);
        wasmBin = await fetchWithProgress(urls.wasm, onProgress, 10, 95);
        ok = true;
        if (urls === CDN_COMPAT) console.warn("[FFmpeg] Usando CDN (local no disponible)");
        break;
      } catch (err) { lastErr = err; console.warn(`[FFmpeg] ${urls.js}:`, err); }
    }

    if (!ok || !jsText || !wasmBin) throw lastErr instanceof Error ? lastErr : new Error("No se pudo cargar FFmpeg");

    if (!coreJsInjected) {
      const blob = new Blob([jsText], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      await loadScript(url).finally(() => URL.revokeObjectURL(url));
      coreJsInjected = true;
    }
    onProgress?.(100);
  })();

  return loadingPromise.catch(err => { resetFFmpegState(); throw err; });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function newFFmpegCore(): Promise<any> {
  if (!window.createFFmpegCore || !wasmBin) throw new Error("FFmpeg no cargado");
  const wasmCopy = wasmBin.slice(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = await (window.createFFmpegCore as any)({ wasmBinary: wasmCopy });
  if (core && typeof core.ready?.then === "function") await core.ready;
  return core;
}

// ── Path B: @ffmpeg/ffmpeg@0.11.6 wrapper (non-SIMD) ─────────────────────────
async function ensureFallbackLoaded(onProgress?: (pct: number) => void): Promise<void> {
  if (fallbackFFmpeg) { onProgress?.(100); return; }
  if (fallbackLoadingPromise) return fallbackLoadingPromise;
  fallbackLoadingPromise = (async () => {
    onProgress?.(0);
    console.warn("[FFmpeg] Cargando fallback @ffmpeg/ffmpeg@0.11.6 (sin SIMD)...");
    await loadScript(FALLBACK_WRAPPER_JS);
    onProgress?.(15);
    if (!window.FFmpeg?.createFFmpeg) throw new Error("FFmpeg wrapper no disponible tras carga");

    const ffmpeg = window.FFmpeg.createFFmpeg({
      log: false,
      corePath: `${FALLBACK_CORE_PATH}/ffmpeg-core.js`,
    });
    // The wrapper downloads ~25MB of WASM; we can only approximate progress here.
    onProgress?.(30);
    await ffmpeg.load();
    onProgress?.(100);
    fallbackFFmpeg = ffmpeg;
  })();
  return fallbackLoadingPromise.catch(err => { fallbackLoadingPromise = null; throw err; });
}

// ── Unified API ──────────────────────────────────────────────────────────────
// Returns a "runner" with the same shape regardless of path taken.
interface FFmpegRunner {
  writeFile: (name: string, data: Uint8Array) => void;
  readFile:  (name: string) => Uint8Array;
  run: (args: string[]) => Promise<number>;
}

async function acquireRunner(): Promise<FFmpegRunner> {
  if (useFallback) {
    await ensureFallbackLoaded();
    const ff = fallbackFFmpeg!;
    return {
      writeFile: (n, d) => ff.FS("writeFile", n, d),
      readFile:  (n)    => ff.FS("readFile", n) as Uint8Array,
      run:       async (args) => { try { await ff.run(...args); return 0; } catch { return 1; } },
    };
  }

  // Try primary 0.12.x path; on SIMD CompileError, switch to fallback
  try {
    const core = await newFFmpegCore();
    const runPrimary = (args: string[]): number => {
      if (typeof core.exec === "function")     return core.exec(...args);
      if (typeof core.ffmpeg === "function")   return core.ffmpeg(args);
      if (typeof core.callMain === "function") return core.callMain(args);
      const methods = Object.keys(core).filter(k => { try { return typeof core[k] === "function"; } catch { return false; } });
      console.error("[FFmpeg] Core methods:", methods, core);
      throw new Error(`Core API desconocida. Métodos: ${methods.slice(0,15).join(",")}`);
    };
    return {
      writeFile: (n, d) => core.FS.writeFile(n, d),
      readFile:  (n)    => core.FS.readFile(n) as Uint8Array,
      run:       async (args) => runPrimary(args),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isSimdErr = msg.includes("SIMD") || msg.includes("CompileError") || msg.includes("Aborted");
    if (!isSimdErr) throw err;
    console.warn("[FFmpeg] SIMD no soportado, cambiando a fallback permanente:", msg);
    useFallback = true;
    resetFFmpegState();
    return acquireRunner(); // retry via fallback path
  }
}

// ─── File buffer cache ───────────────────────────────────────────────────────
const fileBufferCache = new WeakMap<File, Uint8Array>();

async function getFileBuffer(file: File): Promise<Uint8Array> {
  const cached = fileBufferCache.get(file);
  if (cached) return cached;
  const buf = new Uint8Array(await file.arrayBuffer());
  fileBufferCache.set(file, buf);
  return buf;
}

// ─── Unified load entry point ────────────────────────────────────────────────
async function ensureAnyFFmpegReady(onProgress?: (pct: number) => void): Promise<void> {
  if (useFallback) return ensureFallbackLoaded(onProgress);
  return ensureFFmpegLoaded(onProgress);
}

// ─── Cut a single clip from a source file ────────────────────────────────────
async function cutClip(
  sourceFile: File,
  clipStart: number,
  clipEnd: number,
  outName: string,
): Promise<Uint8Array> {
  const buf = await getFileBuffer(sourceFile);
  const ext = sourceFile.name.split(".").pop()?.toLowerCase() ?? "mp4";
  const inputName = `src.${ext}`;
  const needsRemux = ["mov", "avi", "mkv"].includes(ext);

  const runner = await acquireRunner();
  runner.writeFile(inputName, buf);

  const args = [
    "-ss", clipStart.toFixed(3),
    "-to", clipEnd.toFixed(3),
    "-i", inputName,
    ...(needsRemux ? ["-c:v", "copy", "-c:a", "aac"] : ["-c", "copy"]),
    "-movflags", "+faststart",
    "-avoid_negative_ts", "make_zero",
    outName,
  ];

  const ret = await runner.run(args);
  if (ret !== 0) throw new Error(`FFmpeg error (código ${ret})`);

  const data = runner.readFile(outName);
  return new Uint8Array(data);
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

  // ── Export: individual MP4s (FIXED — no .slice() on video buffer) ─────────
  const handleExportIndividual = useCallback(async () => {
    const clipsToExport = buildClipsToExport();
    const localFile = resolveFile(0);

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
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `clips_${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      return;
    }

    try {
      setExportError(null); setClipErrors([]); abortRef.current = false;

      const alreadyLoaded = wasmBin && coreJsInjected;
      if (!alreadyLoaded) {
        setExportStatus("loading-ffmpeg"); setWasmPct(0);
        setExportProgress({ current: 0, total: clipsToExport.length, label: "Descargando FFmpeg..." });
      }
      await ensureAnyFFmpegReady(pct => setWasmPct(pct));
      setExportStatus("exporting");

      const errors: string[] = [];

      for (let i = 0; i < clipsToExport.length; i++) {
        if (abortRef.current) break;
        const clip = clipsToExport[i];
        const sourceFile = resolveFile(clip.videoFileIndex) ?? localFile;
        const safeName = clip.tipo.replace(/[^a-zA-Z0-9]/g, "_");
        const outName = `clip_${String(i+1).padStart(2,"0")}_${safeName}.mp4`;

        setExportProgress({ current: i + 1, total: clipsToExport.length, label: clip.label });

        try {
          // ✅ FIX: cutClip uses getFileBuffer (cached, no slice)
          const data = await cutClip(sourceFile, clip.clip_start, clip.clip_end, outName);

          // Sequential download with short delay so browser doesn't block
          await new Promise<void>((resolve) => {
            const url = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" }));
            const a = document.createElement("a");
            a.href = url; a.download = outName; a.style.display = "none";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 800);
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "error desconocido";
          console.error(`Clip ${i+1} falló:`, msg);
          errors.push(`Clip ${i+1} (${clip.label}): ${msg}`);
          // ✅ FIX: continue with next clip instead of stopping everything
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

  // ── Export: compile all selected clips into one MP4 ───────────────────────
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

      const alreadyLoaded = wasmBin && coreJsInjected;
      if (!alreadyLoaded) {
        setExportStatus("loading-ffmpeg"); setWasmPct(0);
        setExportProgress({ current: 0, total: clipsToExport.length + 1, label: "Descargando FFmpeg..." });
      }
      await ensureAnyFFmpegReady(pct => setWasmPct(pct));
      setExportStatus("exporting");

      // ── Step 1: cut each clip ────────────────────────────────────────────
      const cutBuffers: { name: string; data: Uint8Array }[] = [];
      const errors: string[] = [];

      for (let i = 0; i < clipsToExport.length; i++) {
        if (abortRef.current) break;
        const clip = clipsToExport[i];
        const sourceFile = resolveFile(clip.videoFileIndex) ?? localFile;
        const outName = `clip_${String(i+1).padStart(3,"0")}.mp4`;

        setExportProgress({
          current: i + 1,
          total: clipsToExport.length + 1,
          label: `Cortando ${i+1}/${clipsToExport.length}: ${clip.label}`,
        });

        try {
          const data = await cutClip(sourceFile, clip.clip_start, clip.clip_end, outName);
          cutBuffers.push({ name: outName, data });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "error";
          errors.push(`Clip ${i+1}: ${msg}`);
          console.warn(`Clip ${i+1} falló, lo salteamos:`, msg);
        }
      }

      if (cutBuffers.length === 0) throw new Error("Ningún clip se pudo cortar.");
      setClipErrors(errors);

      // ── Step 2: concatenate ───────────────────────────────────────────────
      setExportStatus("compiling");
      setExportProgress({
        current: clipsToExport.length + 1,
        total: clipsToExport.length + 1,
        label: `Compilando ${cutBuffers.length} clips en un solo video...`,
      });

      const compileRunner = await acquireRunner();

      // Write all cut clips into the runner's virtual FS
      for (const { name, data } of cutBuffers) {
        compileRunner.writeFile(name, data);
      }

      // Create concat list (FFmpeg concat demuxer format)
      const concatList = cutBuffers.map(c => `file '${c.name}'`).join("\n");
      compileRunner.writeFile("concat.txt", new TextEncoder().encode(concatList));

      const concatArgs = [
        "-f", "concat", "-safe", "0", "-i", "concat.txt",
        "-c", "copy", "-movflags", "+faststart",
        "compilado.mp4",
      ];

      const ret = await compileRunner.run(concatArgs);
      if (ret !== 0) throw new Error(`Error al concatenar clips (código ${ret})`);

      const compiled = compileRunner.readFile("compilado.mp4");
      const blob = new Blob([new Uint8Array(compiled).buffer as ArrayBuffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compilado_${new Date().toISOString().slice(0,10)}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      setExportStatus("done");
      if (errors.length > 0) setExportError(`${errors.length} clip(s) fallaron y fueron salteados.`);
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
                    :`${selected.size} MP4${selected.size>1?"s":""}`}
                </button>

                {/* Compile into 1 video button */}
                <button onClick={handleCompile} disabled={isBusy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg font-display font-bold tracking-widest text-xs transition-all
                    ${exportStatus==="compiling"?"bg-amber-500/10 border-amber-500/30 text-amber-300 cursor-wait opacity-75"
                    :isBusy?"bg-amber-500/10 border-amber-500/30 text-amber-300 cursor-wait opacity-75"
                    :"bg-amber-500/15 border-amber-500/40 hover:bg-amber-500/25 text-amber-400"}`}>
                  {exportStatus==="compiling"?<Loader2 className="w-3.5 h-3.5 animate-spin" />:<Combine className="w-3.5 h-3.5" />}
                  {exportStatus==="compiling"?"COMPILANDO...":"COMPILAR EN 1 MP4"}
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
                    {exportStatus==="loading-ffmpeg"?`Descargando FFmpeg... ${wasmPct}%`:exportProgress.label}
                  </p>
                </div>
                {exportStatus==="loading-ffmpeg"&&<span className="text-violet-300 font-mono text-xs shrink-0">{wasmPct}%</span>}
              </div>
              <div className="w-full h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all duration-200"
                  style={{width: exportStatus==="loading-ffmpeg"?`${wasmPct}%`:`${(exportProgress.current/exportProgress.total)*100}%`}} />
              </div>
              {exportStatus==="loading-ffmpeg"&&<p className="text-[#484f58] font-mono text-xs mt-1.5">Solo se descarga una vez · queda cacheado en el browser</p>}
              {exportStatus==="compiling"&&<p className="text-[#484f58] font-mono text-xs mt-1.5">Concatenando clips con FFmpeg concat demuxer...</p>}
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
                      <span className="text-violet-400">MP4s individuales</span> — descarga cada clip por separado con -c copy
                    </p>
                    <p className="text-[#8b949e] font-mono text-xs">
                      <span className="text-amber-400">Compilar en 1 MP4</span> — une todos los clips seleccionados en un solo video
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[#484f58] font-mono text-xs mb-1 uppercase tracking-widest">Sin video local — se exporta JSON:</p>
                  <p className="text-[#8b949e] font-mono text-xs">Cargá un video local para exportar MP4 directamente</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
