"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Upload, Youtube, Play, Clock } from "lucide-react";
import type { VideoMode } from "@/types";

export interface VideoPlayerHandle {
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
}

interface VideoPlayerProps {
  onModeChange?: (mode: VideoMode) => void;
}

// Extract YouTube video ID from various URL formats
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
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number }) => void;
          };
        }
      ) => YouTubePlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayer {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ onModeChange }, ref) => {
    const [mode, setMode] = useState<VideoMode>(null);
    const [youtubeUrl, setYoutubeUrl] = useState("");
    const [youtubeId, setYoutubeId] = useState<string | null>(null);
    const [ytError, setYtError] = useState("");
    const [localFile, setLocalFile] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const ytPlayerRef = useRef<YouTubePlayer | null>(null);
    const ytApiLoadedRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const timeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Expose getCurrentTime and seekTo via ref
    useImperativeHandle(ref, () => ({
      getCurrentTime: () => {
        if (mode === "local" && videoRef.current) {
          return videoRef.current.currentTime;
        }
        if (mode === "youtube" && ytPlayerRef.current) {
          return ytPlayerRef.current.getCurrentTime();
        }
        return 0;
      },
      seekTo: (time: number) => {
        const t = Math.max(0, time);
        if (mode === "local" && videoRef.current) {
          videoRef.current.currentTime = t;
          videoRef.current.play();
          setIsPlaying(true);
        }
        if (mode === "youtube" && ytPlayerRef.current) {
          ytPlayerRef.current.seekTo(t, true);
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        }
      },
    }));

    // Track current time for display
    useEffect(() => {
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      timeIntervalRef.current = setInterval(() => {
        if (mode === "local" && videoRef.current) {
          setCurrentTime(videoRef.current.currentTime);
        } else if (mode === "youtube" && ytPlayerRef.current) {
          try {
            setCurrentTime(ytPlayerRef.current.getCurrentTime());
          } catch {}
        }
      }, 250);
      return () => {
        if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      };
    }, [mode]);

    // Load YouTube IFrame API
    const loadYouTubeAPI = useCallback(() => {
      return new Promise<void>((resolve) => {
        if (window.YT && window.YT.Player) {
          resolve();
          return;
        }
        if (ytApiLoadedRef.current) {
          const interval = setInterval(() => {
            if (window.YT && window.YT.Player) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
          return;
        }
        ytApiLoadedRef.current = true;
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => resolve();
      });
    }, []);

    // Init YouTube player
    const initYouTubePlayer = useCallback(
      async (videoId: string) => {
        await loadYouTubeAPI();
        // Destroy previous player if exists
        if (ytPlayerRef.current) {
          ytPlayerRef.current.destroy();
          ytPlayerRef.current = null;
        }
        // Small delay for DOM
        await new Promise((r) => setTimeout(r, 100));

        ytPlayerRef.current = new window.YT.Player("yt-player-container", {
          videoId,
          playerVars: {
            autoplay: 0,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
          },
          events: {
            onStateChange: (event) => {
              setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
            },
          },
        });
      },
      [loadYouTubeAPI]
    );

    const handleYoutubeSubmit = useCallback(
      (e: React.FormEvent) => {
        e.preventDefault();
        const id = extractYouTubeId(youtubeUrl);
        if (!id) {
          setYtError("URL de YouTube inválida. Revisá el formato.");
          return;
        }
        setYtError("");
        setYoutubeId(id);
        setMode("youtube");
        onModeChange?.("youtube");
        // Player initialized via useEffect below
      },
      [youtubeUrl, onModeChange]
    );

    useEffect(() => {
      if (mode === "youtube" && youtubeId) {
        initYouTubePlayer(youtubeId);
      }
    }, [mode, youtubeId, initYouTubePlayer]);

    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setLocalFile(url);
        setMode("local");
        onModeChange?.("local");
      },
      [onModeChange]
    );

    const formatTime = (t: number) => {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const ms = Math.floor((t % 1) * 10);
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
    };

    return (
      <div className="flex flex-col gap-4">
        {/* Source selector */}
        {!mode && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-pitch-600 bg-pitch-800 hover:border-accent-green/50 hover:bg-pitch-700 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center group-hover:bg-accent-green/20 transition-colors">
                <Upload className="w-5 h-5 text-accent-green" />
              </div>
              <div className="text-center">
                <p className="font-display font-semibold text-white tracking-wide">
                  VIDEO LOCAL
                </p>
                <p className="text-xs text-pitch-500 mt-1 font-mono">
                  MP4, MOV, AVI, WebM
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                setMode("youtube");
                onModeChange?.("youtube");
              }}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border border-pitch-600 bg-pitch-800 hover:border-red-500/50 hover:bg-pitch-700 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                <Youtube className="w-5 h-5 text-red-400" />
              </div>
              <div className="text-center">
                <p className="font-display font-semibold text-white tracking-wide">
                  YOUTUBE
                </p>
                <p className="text-xs text-pitch-500 mt-1 font-mono">
                  Pegar link de video
                </p>
              </div>
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* YouTube URL input */}
        {mode === "youtube" && !youtubeId && (
          <form
            onSubmit={handleYoutubeSubmit}
            className="flex flex-col gap-3"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 bg-pitch-800 border border-pitch-600 rounded-lg px-4 py-3 text-white placeholder-pitch-500 font-mono text-sm focus:outline-none focus:border-red-500/60 transition-colors"
                autoFocus
              />
              <button
                type="submit"
                className="px-5 py-3 bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 rounded-lg text-red-400 font-display font-semibold tracking-wide transition-all"
              >
                CARGAR
              </button>
            </div>
            {ytError && (
              <p className="text-red-400 text-xs font-mono px-1">{ytError}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setMode(null);
                onModeChange?.(null);
              }}
              className="text-pitch-500 text-xs hover:text-pitch-400 font-mono text-left"
            >
              ← volver
            </button>
          </form>
        )}

        {/* Local video player */}
        {mode === "local" && localFile && (
          <div className="relative rounded-xl overflow-hidden border border-pitch-600 bg-black">
            <video
              ref={videoRef}
              src={localFile}
              controls
              className="w-full max-h-[420px] object-contain"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <button
              onClick={() => {
                setMode(null);
                setLocalFile(null);
                onModeChange?.(null);
              }}
              className="absolute top-3 right-3 text-xs bg-black/70 border border-pitch-600 text-pitch-400 hover:text-white px-3 py-1 rounded font-mono transition-colors"
            >
              cambiar
            </button>
          </div>
        )}

        {/* YouTube player */}
        {mode === "youtube" && youtubeId && (
          <div className="relative rounded-xl overflow-hidden border border-pitch-600 bg-black">
            <div
              id="yt-player-container"
              className="w-full aspect-video"
            />
            <button
              onClick={() => {
                setMode(null);
                setYoutubeId(null);
                setYoutubeUrl("");
                onModeChange?.(null);
              }}
              className="absolute top-3 right-3 text-xs bg-black/70 border border-pitch-600 text-pitch-400 hover:text-white px-3 py-1 rounded font-mono transition-colors"
            >
              cambiar
            </button>
          </div>
        )}

        {/* Time display */}
        {mode && (
          <div className="flex items-center gap-2 px-4 py-2 bg-pitch-800 rounded-lg border border-pitch-600 w-fit">
            <Clock className="w-3.5 h-3.5 text-accent-green" />
            <span className="font-mono text-sm text-accent-green tabular-nums">
              {formatTime(currentTime)}
            </span>
            <span className="text-pitch-500 text-xs font-mono ml-2">
              {isPlaying ? (
                <span className="text-accent-green flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-accent-green rounded-full animate-pulse inline-block" />
                  EN VIVO
                </span>
              ) : (
                "PAUSADO"
              )}
            </span>
          </div>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
