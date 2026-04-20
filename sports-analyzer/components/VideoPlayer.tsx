"use client";
import React, {
  useRef, useState, useEffect, useCallback,
  forwardRef, useImperativeHandle,
} from "react";
import { Upload, Youtube, Clock } from "lucide-react";
import type { VideoMode } from "@/types";

export interface VideoPlayerHandle {
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  getMode: () => VideoMode;
  getLocalFile: () => File | null;
  getVideoElement: () => HTMLVideoElement | null;
}

interface VideoPlayerProps {
  onModeChange?: (mode: VideoMode) => void;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, options: {
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
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
}

function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
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

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ onModeChange }, ref) => {
    // "local" | "youtube" | null
    const [mode, setMode] = useState<VideoMode>(null);
    // Which sub-screen: "pick" = source picker, "yt-input" = url form, "playing" = video visible
    const [screen, setScreen] = useState<"pick" | "yt-input" | "playing">("pick");

    const [localSrc, setLocalSrc]     = useState<string | null>(null);
    const [localName, setLocalName]   = useState<string>("");
    const [ytUrl, setYtUrl]           = useState("");
    const [ytId, setYtId]             = useState<string | null>(null);
    const [ytError, setYtError]       = useState("");
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying]   = useState(false);

    const videoRef    = useRef<HTMLVideoElement>(null);
    const ytPlayerRef = useRef<YTPlayer | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const localSrcRef = useRef<string | null>(null);  // track blob for revoke
    const localFileRef = useRef<File | null>(null);   // original File for export

    // ── Expose handle ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getCurrentTime: () => {
        if (mode === "local" && videoRef.current) return videoRef.current.currentTime;
        if (mode === "youtube" && ytPlayerRef.current) {
          try { return ytPlayerRef.current.getCurrentTime(); } catch { return 0; }
        }
        return 0;
      },
      seekTo: (time: number) => {
        const t = Math.max(0, time);
        if (mode === "local" && videoRef.current) {
          videoRef.current.currentTime = t;
          videoRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
        if (mode === "youtube" && ytPlayerRef.current) {
          try { ytPlayerRef.current.seekTo(t, true); ytPlayerRef.current.playVideo(); setIsPlaying(true); } catch {}
        }
      },
      getMode: () => mode,
      getLocalFile: () => localFileRef.current,
      getVideoElement: () => videoRef.current,
    }));

    // ── Time polling ─────────────────────────────────────────────────────────
    useEffect(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (screen !== "playing") return;
      intervalRef.current = setInterval(() => {
        if (mode === "local" && videoRef.current) {
          setCurrentTime(videoRef.current.currentTime);
        } else if (mode === "youtube" && ytPlayerRef.current) {
          try { setCurrentTime(ytPlayerRef.current.getCurrentTime()); } catch {}
        }
      }, 200);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [mode, screen]);

    // ── Init YT player when ytId is set ──────────────────────────────────────
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
            onStateChange: (e) => {
              try { setIsPlaying(e.data === window.YT.PlayerState.PLAYING); } catch {}
            },
          },
        });
      })();
      return () => { cancelled = true; };
    }, [ytId]);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const destroyYT = useCallback(() => {
      if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch {} ytPlayerRef.current = null; }
      setYtId(null);
      setYtUrl("");
      setYtError("");
    }, []);

    const revokeLocal = useCallback(() => {
      if (localSrcRef.current) { URL.revokeObjectURL(localSrcRef.current); localSrcRef.current = null; }
      setLocalSrc(null);
      setLocalName("");
    }, []);

    const switchTo = useCallback((newMode: VideoMode) => {
      // Clean up old mode first
      if (newMode !== "youtube") destroyYT();
      if (newMode !== "local")   revokeLocal();
      setMode(newMode);
      setCurrentTime(0);
      setIsPlaying(false);
      onModeChange?.(newMode);
    }, [destroyYT, revokeLocal, onModeChange]);

    // ── File pick ────────────────────────────────────────────────────────────
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Clean up YouTube if active
      destroyYT();
      // Revoke previous blob
      if (localSrcRef.current) URL.revokeObjectURL(localSrcRef.current);
      const url = URL.createObjectURL(file);
      localSrcRef.current = url;
      localFileRef.current = file;
      setLocalSrc(url);
      setLocalName(file.name);
      setMode("local");
      setScreen("playing");
      setCurrentTime(0);
      setIsPlaying(false);
      onModeChange?.("local");
      // Reset input so same file can be re-picked
      e.target.value = "";
    }, [destroyYT, onModeChange]);

    // ── YouTube submit ────────────────────────────────────────────────────────
    const handleYtSubmit = useCallback((e: React.FormEvent) => {
      e.preventDefault();
      const id = extractYouTubeId(ytUrl);
      if (!id) { setYtError("URL inválida. Revisá el formato."); return; }
      setYtError("");
      revokeLocal();
      // If same video, just keep going; otherwise set new id
      setYtId(id);
      setMode("youtube");
      setScreen("playing");
      setCurrentTime(0);
      setIsPlaying(false);
      onModeChange?.("youtube");
    }, [ytUrl, revokeLocal, onModeChange]);

    // ── Change source ─────────────────────────────────────────────────────────
    const handleChange = useCallback(() => {
      switchTo(null);
      setScreen("pick");
    }, [switchTo]);

    const fmt = (t: number) => {
      const m = Math.floor(t / 60), s = Math.floor(t % 60), ds = Math.floor((t % 1) * 10);
      return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${ds}`;
    };

    return (
      <div className="flex flex-col gap-3">

        {/* ── Source picker ─────────────────────────────────────────────── */}
        {screen === "pick" && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-[#00ff88]/50 hover:bg-[#00ff88]/5 transition-all group">
              <div className="w-12 h-12 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center group-hover:bg-[#00ff88]/20 transition-colors">
                <Upload className="w-5 h-5 text-[#00ff88]" />
              </div>
              <div className="text-center">
                <p className="font-display font-semibold text-white tracking-wide text-sm">VIDEO LOCAL</p>
                <p className="text-xs text-[#484f58] mt-1 font-mono">MP4 · MOV · WebM</p>
              </div>
            </button>

            <button onClick={() => setScreen("yt-input")}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-red-500/50 hover:bg-red-500/5 transition-all group">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                <Youtube className="w-5 h-5 text-red-400" />
              </div>
              <div className="text-center">
                <p className="font-display font-semibold text-white tracking-wide text-sm">YOUTUBE</p>
                <p className="text-xs text-[#484f58] mt-1 font-mono">Pegá el link</p>
              </div>
            </button>
          </div>
        )}

        {/* ── YouTube URL form ──────────────────────────────────────────── */}
        {screen === "yt-input" && (
          <form onSubmit={handleYtSubmit} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text" autoFocus value={ytUrl} onChange={e => setYtUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3 text-white placeholder-[#484f58] font-mono text-sm focus:outline-none focus:border-red-500/50 transition-colors"
              />
              <button type="submit"
                className="px-5 py-3 bg-red-500/15 border border-red-500/40 hover:bg-red-500/25 rounded-lg text-red-400 font-display font-semibold tracking-wide transition-all">
                CARGAR
              </button>
            </div>
            {ytError && <p className="text-red-400 text-xs font-mono">{ytError}</p>}
            <button type="button" onClick={() => setScreen("pick")}
              className="text-[#484f58] text-xs hover:text-white font-mono text-left transition-colors">
              ← volver
            </button>
          </form>
        )}

        {/* ── Playing: Local ────────────────────────────────────────────── */}
        {screen === "playing" && mode === "local" && localSrc && (
          <div className="flex flex-col gap-2">
            <div className="relative rounded-xl overflow-hidden border border-[#30363d] bg-black">
              <video
                ref={videoRef} src={localSrc} controls
                className="w-full max-h-[420px] object-contain"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] rounded-lg border border-[#21262d] w-fit">
                <Clock className="w-3.5 h-3.5 text-[#00ff88]" />
                <span className="font-mono text-sm text-[#00ff88] tabular-nums">{fmt(currentTime)}</span>
                {isPlaying && <span className="w-1.5 h-1.5 bg-[#00ff88] rounded-full animate-pulse" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#484f58] font-mono text-xs truncate max-w-[160px]">{localName}</span>
                <button onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-mono text-[#484f58] hover:text-white border border-[#30363d] hover:border-[#484f58] px-2.5 py-1 rounded-lg bg-[#161b22] transition-all">
                  cambiar archivo
                </button>
                <button onClick={handleChange}
                  className="text-xs font-mono text-[#484f58] hover:text-white border border-[#30363d] hover:border-[#484f58] px-2.5 py-1 rounded-lg bg-[#161b22] transition-all">
                  otra fuente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Playing: YouTube ──────────────────────────────────────────── */}
        {screen === "playing" && mode === "youtube" && (
          <div className="flex flex-col gap-2">
            <div className="relative rounded-xl overflow-hidden border border-[#30363d] bg-black">
              <div id="yt-player-container" className="w-full aspect-video" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] rounded-lg border border-[#21262d] w-fit">
                <Clock className="w-3.5 h-3.5 text-red-400" />
                <span className="font-mono text-sm text-red-400 tabular-nums">{fmt(currentTime)}</span>
                {isPlaying && <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setScreen("yt-input"); destroyYT(); setMode(null); onModeChange?.(null); }}
                  className="text-xs font-mono text-[#484f58] hover:text-white border border-[#30363d] hover:border-[#484f58] px-2.5 py-1 rounded-lg bg-[#161b22] transition-all">
                  otro video YT
                </button>
                <button onClick={handleChange}
                  className="text-xs font-mono text-[#484f58] hover:text-white border border-[#30363d] hover:border-[#484f58] px-2.5 py-1 rounded-lg bg-[#161b22] transition-all">
                  otra fuente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden file input — always in DOM so it works after mode changes */}
        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
