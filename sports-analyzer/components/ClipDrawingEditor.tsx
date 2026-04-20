"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { Undo2, Trash2, Download, X, Minus, ArrowRight, Type, Pencil } from "lucide-react";

type Tool = "pen" | "line" | "arrow" | "text";
interface Point { x: number; y: number; }
interface Shape {
  id: string; tool: Tool; color: string; size: number;
  points: Point[]; text?: string;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClose: () => void;
}

const COLORS = ["#ffffff", "#ff3333", "#33ff88", "#3388ff", "#ffcc00", "#ff33cc", "#00ccff", "#ff8800"];

export default function ClipDrawingEditor({ videoRef, onClose }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool]     = useState<Tool>("arrow");
  const [color, setColor]   = useState("#ff3333");
  const [size, setSize]     = useState(3);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [drawing, setDrawing] = useState<Shape | null>(null);
  const [isDown, setIsDown]   = useState(false);
  const [textPos, setTextPos] = useState<Point | null>(null);
  const [textVal, setTextVal] = useState("");
  const textRef = useRef<HTMLInputElement>(null);

  // ── Sync canvas size to the actual video element ──────────────────────────
  const syncSize = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const r = video.getBoundingClientRect();
    if (canvas.width !== r.width || canvas.height !== r.height) {
      canvas.width  = r.width;
      canvas.height = r.height;
    }
  }, [videoRef]);

  useEffect(() => {
    syncSize();
    const ro = new ResizeObserver(syncSize);
    if (videoRef.current) ro.observe(videoRef.current);
    return () => ro.disconnect();
  }, [syncSize, videoRef]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const drawShape = useCallback((ctx: CanvasRenderingContext2D, s: Shape) => {
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle   = s.color;
    ctx.lineWidth   = s.size;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    if (s.tool === "pen" && s.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      s.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    if ((s.tool === "line" || s.tool === "arrow") && s.points.length === 2) {
      const [a, b] = s.points;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (s.tool === "arrow") {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const L = 14 + s.size * 2.5;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - L * Math.cos(ang - 0.42), b.y - L * Math.sin(ang - 0.42));
        ctx.lineTo(b.x - L * Math.cos(ang + 0.42), b.y - L * Math.sin(ang + 0.42));
        ctx.closePath(); ctx.fill();
      }
    }

    if (s.tool === "text" && s.text && s.points.length) {
      const fs = 13 + s.size * 5;
      ctx.font = `bold ${fs}px Inter, Arial, sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 5;
      ctx.fillText(s.text, s.points[0].x, s.points[0].y);
    }
    ctx.restore();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncSize();
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shapes.forEach(s => drawShape(ctx, s));
    if (drawing) drawShape(ctx, drawing);
  }, [shapes, drawing, drawShape, syncSize]);

  // ── Pointer ───────────────────────────────────────────────────────────────
  const pos = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const p = pos(e);
    if (tool === "text") { setTextPos(p); setTextVal(""); setTimeout(() => textRef.current?.focus(), 50); return; }
    setIsDown(true);
    setDrawing({ id: crypto.randomUUID(), tool, color, size, points: [p] });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!isDown || !drawing) return;
    e.preventDefault();
    const p = pos(e);
    setDrawing(d => !d ? null : d.tool === "pen"
      ? { ...d, points: [...d.points, p] }
      : { ...d, points: [d.points[0], p] });
  };

  const onUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!isDown || !drawing) return;
    setIsDown(false);
    if (drawing.points.length >= 1) setShapes(s => [...s, drawing]);
    setDrawing(null);
  };

  const commitText = () => {
    if (textPos && textVal.trim()) {
      setShapes(s => [...s, { id: crypto.randomUUID(), tool: "text", color, size, points: [textPos], text: textVal }]);
    }
    setTextPos(null); setTextVal("");
  };

  // ── Export composite (video frame + drawing) ──────────────────────────────
  const exportFrame = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const out = document.createElement("canvas");
    out.width = video.videoWidth || canvas.width;
    out.height = video.videoHeight || canvas.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(video, 0, 0, out.width, out.height);
    const sx = out.width / canvas.width, sy = out.height / canvas.height;
    ctx.save(); ctx.scale(sx, sy);
    shapes.forEach(s => drawShape(ctx, s));
    ctx.restore();
    out.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `frame_${Date.now()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }, "image/png");
  };

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button key={t} onClick={() => setTool(t)} title={label}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-all flex items-center gap-1
        ${tool === t ? "bg-violet-500/25 border-violet-400/60 text-violet-200" : "bg-[#161b22] border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#484f58]"}`}>
      {icon} <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    // Full-screen overlay
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117]/95 border-b border-[#21262d] flex-wrap shrink-0">
        <span className="font-display font-bold text-[10px] tracking-widest text-[#484f58] uppercase">Editor</span>

        <div className="w-px h-4 bg-[#30363d]" />

        {toolBtn("pen",   <Pencil className="w-3.5 h-3.5" />,   "Trazo")}
        {toolBtn("line",  <Minus  className="w-3.5 h-3.5" />,   "Línea")}
        {toolBtn("arrow", <ArrowRight className="w-3.5 h-3.5" />, "Flecha")}
        {toolBtn("text",  <Type   className="w-3.5 h-3.5" />,   "Texto")}

        <div className="w-px h-4 bg-[#30363d]" />

        {/* Colors */}
        <div className="flex gap-1 items-center">
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              style={{ background: c }}
              className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? "border-white scale-110 shadow-lg" : "border-transparent opacity-70 hover:opacity-100"}`} />
          ))}
        </div>

        <div className="w-px h-4 bg-[#30363d]" />

        {/* Stroke size */}
        <div className="flex items-center gap-1.5">
          <span className="text-[#484f58] text-xs font-mono hidden sm:block">Grosor</span>
          <input type="range" min={1} max={10} value={size} onChange={e => setSize(+e.target.value)}
            className="w-14 accent-violet-500" />
          <span className="w-4 text-center text-[#8b949e] text-xs font-mono">{size}</span>
        </div>

        <div className="w-px h-4 bg-[#30363d]" />

        <button onClick={() => setShapes(s => s.slice(0, -1))} disabled={shapes.length === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-white disabled:opacity-30 text-xs font-mono transition-all">
          <Undo2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Deshacer</span>
        </button>

        <button onClick={() => setShapes([])} disabled={shapes.length === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-rose-400 hover:text-rose-300 disabled:opacity-30 text-xs font-mono transition-all">
          <Trash2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Limpiar</span>
        </button>

        <button onClick={exportFrame}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-400 text-xs font-mono transition-all">
          <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Exportar frame</span>
        </button>

        <div className="flex-1" />

        <button onClick={onClose}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-white text-xs font-mono transition-all">
          <X className="w-3.5 h-3.5" /><span className="hidden sm:inline">Cerrar</span>
        </button>
      </div>

      {/* ── Video + canvas layer ─────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center overflow-hidden" ref={containerRef}>
        <div className="relative inline-block">
          {/* Mirror the video: we render a <video> pointing to the same src */}
          {videoRef.current && (
            <video
              src={(videoRef.current as HTMLVideoElement).src}
              className="block max-w-full max-h-[calc(100vh-120px)] object-contain bg-black"
              style={{ display: "block" }}
              ref={el => {
                if (!el || !videoRef.current) return;
                // Sync current time so it shows the same frame
                el.currentTime = videoRef.current.currentTime;
              }}
            />
          )}

          {/* Drawing canvas — absolute, covers the video exactly */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ cursor: tool === "text" ? "text" : "crosshair", touchAction: "none" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          />

          {/* Text input that appears at click position */}
          {textPos && (
            <div className="absolute z-10 flex flex-col gap-1"
              style={{ left: textPos.x, top: Math.max(0, textPos.y - 44) }}>
              <input
                ref={textRef}
                value={textVal}
                onChange={e => setTextVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") commitText(); if (e.key === "Escape") { setTextPos(null); setTextVal(""); } }}
                placeholder="Escribí y Enter..."
                style={{ color, borderColor: color, fontSize: 14 + size * 3 }}
                className="bg-black/80 border-2 rounded px-2 py-1 font-bold focus:outline-none min-w-[180px] shadow-xl"
              />
              <div className="flex gap-1">
                <button onClick={commitText} className="text-xs px-2 py-0.5 bg-violet-500/30 border border-violet-500/50 text-violet-200 rounded font-mono">OK</button>
                <button onClick={() => { setTextPos(null); setTextVal(""); }} className="text-xs px-2 py-0.5 bg-[#161b22] border border-[#30363d] text-[#8b949e] rounded font-mono">✕</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-center py-1.5 bg-[#0d1117]/80 border-t border-[#21262d]">
        <p className="text-[#484f58] font-mono text-xs">
          {tool === "pen" ? "✏️ Dibujá libremente sobre el video"
            : tool === "line" ? "— Arrastrá para trazar una línea"
            : tool === "arrow" ? "→ Arrastrá para trazar una flecha"
            : "T Hacé clic donde querés poner el texto"}
        </p>
      </div>
    </div>
  );
}
