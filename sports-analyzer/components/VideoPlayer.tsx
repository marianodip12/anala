"use client";
import React, {
  useRef, useState, useEffect, useCallback,
  forwardRef, useImperativeHandle,
} from "react";
import { Upload, Youtube, Clock } from "lucide-react";
import { saveVideoFile, loadVideoFile, clearVideoFile } from "@/hooks/useVideoStore";
import type { VideoMode, Annotation } from "@/types";

export interface VideoPlayerHandle {
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  getMode: () => VideoMode;
}

interface VideoPlayerProps {
  onModeChange?: (mode: VideoMode) => void;
  annotations?: Annotation[];
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

declare global {
  interface Window {
    YT: {
      Player: new (id: string, opts: {
        videoId: string;
        playerVars?: Record<string, number | string>;
        events?: {
          onReady?: (e: { target: YTPlayer }) => void;
          onStateChange?: (e: { data: number }) => void;
        };
      }) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady: () => void;
    _ytApiReady: boolean;
    _ytApiLoading: boolean;
    _ytApiCallbacks: (() => void)[];
  }
}

interface YTPlayer {
  getCurrentTime: () => number;
  seekTo: (s: number, allow: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
}

function loadYouTubeAPI(): Promise<void> {
  return new Promise(resolve => {
    if (window._ytApiReady) { resolve(); return; }
    if (!window._ytApiCallbacks) window._ytApiCallbacks = [];
    window._ytApiCallbacks.push(resolve);
    if (!window._ytApiLoading) {
      window._ytApiLoading = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => {
        window._ytApiReady = true;
        (window._ytApiCallbacks ?? []).forEach(cb => cb());
        window._ytApiCallbacks = [];
      };
    }
  });
}

// ── Canvas annotation renderer ────────────────────────────────────────────────
function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation) {
  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle   = a.color;
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  if (a.type === "text" && a.text) {
    ctx.font        = `bold ${a.fontSize ?? 18}px 'JetBrains Mono', monospace`;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth   = 3;
    ctx.strokeText(a.text, a.x, a.y);
    ctx.fillStyle   = a.color;
    ctx.fillText(a.text, a.x, a.y);
  }
  if (a.type === "draw" && a.points && a.points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(a.points[0].x, a.points[0].y);
    a.points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
  if (a.type === "rect" && a.x2 !== undefined && a.y2 !== undefined) {
    ctx.strokeRect(a.x, a.y, a.x2 - a.x, a.y2 - a.y);
  }
  if (a.type === "arrow" && a.x2 !== undefined && a.y2 !== undefined) {
    const dx = a.x2 - a.x, dy = a.y2 - a.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx/len, uy = dy/len;
    const hl = 16, hw = 10;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x2 - ux*hl, a.y2 - uy*hl);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a.x2, a.y2);
    ctx.lineTo(a.x2 - ux*hl - uy*hw, a.y2 - uy*hl + ux*hw);
    ctx.lineTo(a.x2 - ux*hl + uy*hw, a.y2 - uy*hl - ux*hw);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ onModeChange, annotations = [] }, ref) => {
    const [mode,   setMode]   = useState<VideoMode>(null);
    const [screen, setScreen] = useState<"pick"|"yt-input"|"playing">("pick");
    const [localSrc,  setLocalSrc]  = useState<string|null>(null);
    const [localName, setLocalName] = useState("");
    const [ytUrl,  setYtUrl]  = useState("");
    const [ytId,   setYtId]   = useState<string|null>(null);
    const [ytError, setYtError] = useState("");
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying,   setIsPlaying]   = useState(false);
    const [restoring, setRestoring] = useState(true); // loading from IDB

    const videoRef     = useRef<HTMLVideoElement>(null);
    const ytPlayerRef  = useRef<YTPlayer|null>(null);
    const intervalRef  = useRef<ReturnType<typeof setInterval>|null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const blobRef      = useRef<string|null>(null);
    const overlayRef   = useRef<HTMLCanvasElement>(null);

    // ── Restore local video from IndexedDB on mount ──────────────────────────
    useEffect(() => {
      loadVideoFile().then(file => {
        if (file) {
          const url = URL.createObjectURL(file);
          blobRef.current = url;
          setLocalSrc(url);
          setLocalName(file.name);
          setMode("local");
          setScreen("playing");
          onModeChange?.("local");
        }
        setRestoring(false);
      });
    }, []); // eslint-disable-line

    // ── Expose handle ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getCurrentTime: () => {
        if (mode === "local" && videoRef.current) return videoRef.current.currentTime;
        if (mode === "youtube" && ytPlayerRef.current) { try { return ytPlayerRef.current.getCurrentTime(); } catch { return 0; } }
        return 0;
      },
      seekTo: (time: number) => {
        const t = Math.max(0, time);
        if (mode === "local" && videoRef.current) { videoRef.current.currentTime = t; videoRef.current.play().catch(()=>{}); setIsPlaying(true); }
        if (mode === "youtube" && ytPlayerRef.current) { try { ytPlayerRef.current.seekTo(t,true); ytPlayerRef.current.playVideo(); setIsPlaying(true); } catch {} }
      },
      getMode: () => mode,
    }));

    // ── Time polling ─────────────────────────────────────────────────────────
    useEffect(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (screen !== "playing") return;
      intervalRef.current = setInterval(() => {
        if (mode === "local" && videoRef.current) setCurrentTime(videoRef.current.currentTime);
        else if (mode === "youtube" && ytPlayerRef.current) { try { setCurrentTime(ytPlayerRef.current.getCurrentTime()); } catch {} }
      }, 200);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [mode, screen]);

    // ── Annotation overlay ───────────────────────────────────────────────────
    useEffect(() => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const visible = annotations.filter(a => currentTime >= a.start_time && currentTime < a.start_time + a.duration);
      visible.forEach(a => drawAnnotation(ctx, a));
    }, [annotations, currentTime]);

    // ── YouTube init ─────────────────────────────────────────────────────────
    useEffect(() => {
      if (!ytId) return;
      let cancelled = false;
      (async () => {
        await loadYouTubeAPI();
        if (cancelled) return;
        if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch {} ytPlayerRef.current = null; }
        await new Promise(r => setTimeout(r, 80));
        if (cancelled || !document.getElementById("yt-player-container")) return;
        ytPlayerRef.current = new window.YT.Player("yt-player-container", {
          videoId: ytId,
          playerVars: { autoplay: 0, rel: 0, modestbranding: 1, enablejsapi: 1 },
          events: {
            onStateChange: e => { try { setIsPlaying(e.data === window.YT.PlayerState.PLAYING); } catch {} },
          },
        });
      })();
      return () => { cancelled = true; };
    }, [ytId]);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const destroyYT = useCallback(() => {
      if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch {} ytPlayerRef.current = null; }
      setYtId(null); setYtUrl(""); setYtError("");
    }, []);

    const revokeLocal = useCallback(() => {
      if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
      setLocalSrc(null); setLocalName("");
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      destroyYT();
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      const url = URL.createObjectURL(file);
      blobRef.current = url;
      setLocalSrc(url);
      setLocalName(file.name);
      setMode("local");
      setScreen("playing");
      setCurrentTime(0);
      setIsPlaying(false);
      onModeChange?.("local");
      e.target.value = "";
      // Persist to IndexedDB
      await saveVideoFile(file);
    }, [destroyYT, onModeChange]);

    const handleYtSubmit = useCallback((e: React.FormEvent) => {
      e.preventDefault();
      const id = extractYouTubeId(ytUrl);
      if (!id) { setYtError("URL inválida."); return; }
      setYtError("");
      revokeLocal();
      clearVideoFile();
      setYtId(id);
      setMode("youtube");
      setScreen("playing");
      setCurrentTime(0);
      setIsPlaying(false);
      onModeChange?.("youtube");
    }, [ytUrl, revokeLocal, onModeChange]);

    const handleChange = useCallback(() => {
      destroyYT();
      revokeLocal();
      clearVideoFile();
      setMode(null);
      setScreen("pick");
      onModeChange?.(null);
    }, [destroyYT, revokeLocal, onModeChange]);

    const fmt = (t: number) => {
      const m = Math.floor(t/60), s = Math.floor(t%60), ds = Math.floor((t%1)*10);
      return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${ds}`;
    };

    if (restoring) {
      return (
        <div className="flex items-center justify-center h-24 gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-[#00ff88]/30 border-t-[#00ff88] animate-spin"/>
          <span className="text-[#484f58] font-mono text-xs">Restaurando video...</span>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {/* ── Source picker ──────────────────────────────────────────── */}
        {screen === "pick" && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-[#00ff88]/50 hover:bg-[#00ff88]/5 transition-all group">
              <div className="w-12 h-12 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center group-hover:bg-[#00ff88]/20 transition-colors">
                <Upload className="w-5 h-5 text-[#00ff88]"/>
              </div>
              <div className="text-center">
                <p className="font-display font-semibold text-white tracking-wide text-sm">VIDEO LOCAL</p>
                <p className="text-xs text-[#484f58] mt-1 font-mono">MP4 · MOV · WebM</p>
              </div>
            </button>
            <button onClick={() => setScreen("yt-input")}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-red-500/50 hover:bg-red-500/5 transition-all group">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                <Youtube className="w-5 h-5 text-red-400"/>
              </div>
              <div className="text-center">
                <p className="font-display font-semibold text-white tracking-wide text-sm">YOUTUBE</p>
                <p className="text-xs text-[#484f58] mt-1 font-mono">Pegá el link</p>
              </div>
            </button>
          </div>
        )}

        {/* ── YouTube URL form ──────────────────────────────────────── */}
        {screen === "yt-input" && (
          <form onSubmit={handleYtSubmit} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input type="text" autoFocus value={ytUrl} onChange={e => setYtUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3 text-white placeholder-[#484f58] font-mono text-sm focus:outline-none focus:border-red-500/50 transition-colors"/>
              <button type="submit"
                className="px-5 py-3 bg-red-500/15 border border-red-500/40 hover:bg-red-500/25 rounded-lg text-red-400 font-display font-semibold tracking-wide transition-all">
                CARGAR
              </button>
            </div>
            {ytError && <p className="text-red-400 text-xs font-mono">{ytError}</p>}
            <button type="button" onClick={() => setScreen("pick")}
              className="text-[#484f58] text-xs hover:text-white font-mono text-left transition-colors">← volver</button>
          </form>
        )}

        {/* ── Playing: Local ────────────────────────────────────────── */}
        {screen === "playing" && mode === "local" && localSrc && (
          <div className="flex flex-col gap-2">
            {/* Video + annotation overlay stacked */}
            <div className="relative rounded-xl overflow-hidden border border-[#30363d] bg-black">
              <video ref={videoRef} src={localSrc} controls
                className="w-full max-h-[420px] object-contain block"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              {/* Annotation canvas overlay */}
              <canvas ref={overlayRef} width={640} height={360}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{mixBlendMode:"normal"}}
              />
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] rounded-lg border border-[#21262d]">
                <Clock className="w-3.5 h-3.5 text-[#00ff88]"/>
                <span className="font-mono text-sm text-[#00ff88] tabular-nums">{fmt(currentTime)}</span>
                {isPlaying && <span className="w-1.5 h-1.5 bg-[#00ff88] rounded-full animate-pulse"/>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#484f58] font-mono text-xs truncate max-w-[140px]">{localName}</span>
                <button onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-mono text-[#484f58] hover:text-white border border-[#30363d] px-2.5 py-1 rounded-lg bg-[#161b22] transition-all">
                  cambiar archivo
                </button>
                <button onClick={handleChange}
                  className="text-xs font-mono text-[#484f58] hover:text-white border border-[#30363d] px-2.5 py-1 rounded-lg bg-[#161b22] transition-all">
                  otra fuente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Playing: YouTube ──────────────────────────────────────── */}
        {screen === "playing" && mode === "youtube" && (
          <div className="flex flex-col gap-2">
            <div className="relative rounded-xl overflow-hidden border border-[#30363d] bg-black">
              <div id="yt-player-container" className="w-full aspect-video"/>
              {/* Annotation canvas overlay */}
              <canvas ref={overlayRef} width={640} height={360}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] rounded-lg border border-[#21262d]">
                <Clock className="w-3.5 h-3.5 text-red-400"/>
                <span className="font-mono text-sm text-red-400 tabular-nums">{fmt(currentTime)}</span>
                {isPlaying && <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"/>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setScreen("yt-input"); destroyYT(); setMode(null); onModeChange?.(null); }}
                  className="text-xs font-mono text-[#484f58] hover:text-white border border-[#30363d] px-2.5 py-1 rounded-lg bg-[#161b22] transition-all">
                  otro video YT
                </button>
                <button onClick={handleChange}
                  className="text-xs font-mono text-[#484f58] hover:text-white border border-[#30363d] px-2.5 py-1 rounded-lg bg-[#161b22] transition-all">
                  otra fuente
                </button>
              </div>
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange}/>
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
