"use client";
import React, { useRef, useEffect, useState, useCallback } from "react";
import { Pencil, Minus, ArrowRight, Type, Trash2, Undo2, Download, X, Palette } from "lucide-react";

type Tool = "pen" | "line" | "arrow" | "text";

interface Point { x: number; y: number; }
interface DrawingShape {
  id: string;
  tool: Tool;
  color: string;
  size: number;
  points: Point[];   // for pen: all points; for line/arrow: [start, end]; for text: [pos]
  text?: string;
}

interface ClipDrawingEditorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClose: () => void;
}

const COLORS = ["#ffffff", "#ff4444", "#44ff88", "#4488ff", "#ffcc00", "#ff44cc", "#00ccff"];

export default function ClipDrawingEditor({ videoRef, onClose }: ClipDrawingEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ff4444");
  const [size, setSize] = useState(3);
  const [shapes, setShapes] = useState<DrawingShape[]>([]);
  const [current, setCurrent] = useState<DrawingShape | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState<{ pos: Point; value: string } | null>(null);
  const animRef = useRef<number>(0);

  // ── Canvas size matching video ──
  const getCanvas = () => canvasRef.current!;
  const getCtx = () => getCanvas().getContext("2d")!;

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, [videoRef]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // ── Draw all shapes ──
  const drawShape = useCallback((ctx: CanvasRenderingContext2D, shape: DrawingShape) => {
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = shape.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (shape.tool === "pen" && shape.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y);
      ctx.stroke();
    }

    if ((shape.tool === "line" || shape.tool === "arrow") && shape.points.length >= 2) {
      const [a, b] = shape.points;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      if (shape.tool === "arrow") {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const len = 16 + shape.size * 2;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - len * Math.cos(angle - 0.4), b.y - len * Math.sin(angle - 0.4));
        ctx.lineTo(b.x - len * Math.cos(angle + 0.4), b.y - len * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    }

    if (shape.tool === "text" && shape.points.length >= 1 && shape.text) {
      ctx.font = `${14 + shape.size * 4}px 'Inter', sans-serif`;
      ctx.fillStyle = shape.color;
      // Shadow for readability
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText(shape.text, shape.points[0].x, shape.points[0].y);
      ctx.shadowBlur = 0;
    }
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of shapes) drawShape(ctx, s);
    if (current) drawShape(ctx, current);
  }, [shapes, current, drawShape]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(redraw);
    return () => cancelAnimationFrame(animRef.current);
  }, [redraw]);

  // ── Pointer events ──
  const getPos = (e: React.PointerEvent): Point => {
    const rect = getCanvas().getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === "text") {
      const pos = getPos(e);
      setTextInput({ pos, value: "" });
      return;
    }
    const pos = getPos(e);
    setIsDrawing(true);
    setCurrent({ id: crypto.randomUUID(), tool, color, size, points: [pos] });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !current) return;
    const pos = getPos(e);
    if (current.tool === "pen") {
      setCurrent(prev => prev ? { ...prev, points: [...prev.points, pos] } : null);
    } else {
      setCurrent(prev => prev ? { ...prev, points: [prev.points[0], pos] } : null);
    }
  };

  const onPointerUp = () => {
    if (!isDrawing || !current) return;
    setIsDrawing(false);
    if (current.points.length >= 1) setShapes(prev => [...prev, current]);
    setCurrent(null);
  };

  const commitText = () => {
    if (!textInput || !textInput.value.trim()) { setTextInput(null); return; }
    setShapes(prev => [...prev, {
      id: crypto.randomUUID(), tool: "text", color, size,
      points: [textInput.pos], text: textInput.value,
    }]);
    setTextInput(null);
  };

  const undo = () => setShapes(prev => prev.slice(0, -1));
  const clear = () => setShapes([]);

  // ── Export: composite video frame + drawing ──
  const exportFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const out = document.createElement("canvas");
    out.width = video.videoWidth || canvas.width;
    out.height = video.videoHeight || canvas.height;
    const ctx = out.getContext("2d")!;

    // Draw video frame
    ctx.drawImage(video, 0, 0, out.width, out.height);

    // Scale drawing canvas to video resolution
    const scaleX = out.width / canvas.width;
    const scaleY = out.height / canvas.height;
    ctx.save();
    ctx.scale(scaleX, scaleY);
    for (const s of shapes) drawShape(ctx, s);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#0d1117] border-b border-[#21262d] flex-wrap">
        <span className="font-display font-bold text-xs tracking-widest text-[#484f58] uppercase mr-2">Editor</span>

        {/* Tools */}
        {([["pen", "✏️", "Trazo libre"], ["line", "—", "Línea"], ["arrow", "→", "Flecha"], ["text", "T", "Texto"]] as const).map(([t, icon, label]) => (
          <button key={t} onClick={() => setTool(t as Tool)} title={label}
            className={`px-2.5 py-1.5 rounded-lg text-sm font-mono border transition-all ${tool === t ? "bg-violet-500/20 border-violet-500/50 text-violet-300" : "bg-[#161b22] border-[#30363d] text-[#8b949e] hover:text-white"}`}>
            {icon}
          </button>
        ))}

        <div className="w-px h-5 bg-[#30363d] mx-1" />

        {/* Colors */}
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? "border-white scale-125" : "border-transparent"}`}
            style={{ background: c }} />
        ))}

        <div className="w-px h-5 bg-[#30363d] mx-1" />

        {/* Size */}
        <div className="flex items-center gap-1.5">
          <span className="text-[#484f58] font-mono text-xs">Grosor</span>
          <input type="range" min={1} max={8} value={size} onChange={e => setSize(Number(e.target.value))}
            className="w-16 accent-violet-500" />
          <span className="text-[#8b949e] font-mono text-xs w-4">{size}</span>
        </div>

        <div className="w-px h-5 bg-[#30363d] mx-1" />

        <button onClick={undo} title="Deshacer" disabled={shapes.length === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-white disabled:opacity-30 text-xs font-mono transition-all">
          <Undo2 className="w-3.5 h-3.5" /> Deshacer
        </button>

        <button onClick={clear} title="Borrar todo" disabled={shapes.length === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-rose-400 hover:text-rose-300 disabled:opacity-30 text-xs font-mono transition-all">
          <Trash2 className="w-3.5 h-3.5" /> Limpiar
        </button>

        <button onClick={exportFrame}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-400 text-xs font-mono transition-all">
          <Download className="w-3.5 h-3.5" /> Exportar frame
        </button>

        <div className="flex-1" />
        <button onClick={onClose}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-white text-xs font-mono transition-all">
          <X className="w-3.5 h-3.5" /> Cerrar
        </button>
      </div>

      {/* Canvas overlay on video */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-black">
        {/* Actual video element from the page (we just show the current frame) */}
        <div className="relative w-full h-full flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="absolute cursor-crosshair touch-none"
            style={{ cursor: tool === "text" ? "text" : "crosshair" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />

          {/* Text input popup */}
          {textInput && (
            <div className="absolute z-10 flex flex-col gap-1"
              style={{ left: textInput.pos.x, top: textInput.pos.y - 40 }}>
              <input
                autoFocus
                type="text"
                value={textInput.value}
                onChange={e => setTextInput(t => t ? { ...t, value: e.target.value } : null)}
                onKeyDown={e => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextInput(null); }}
                placeholder="Escribí y presioná Enter"
                className="bg-[#0d1117] border border-violet-500/50 rounded px-2 py-1 text-white font-mono text-sm focus:outline-none min-w-[200px]"
                style={{ color }}
              />
              <div className="flex gap-1">
                <button onClick={commitText} className="text-xs px-2 py-0.5 bg-violet-500/20 border border-violet-500/40 text-violet-300 rounded font-mono">OK</button>
                <button onClick={() => setTextInput(null)} className="text-xs px-2 py-0.5 bg-[#161b22] border border-[#30363d] text-[#8b949e] rounded font-mono">✕</button>
              </div>
            </div>
          )}

          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[#484f58] font-mono text-xs pointer-events-none">
            {tool === "pen" ? "Dibujá libremente" : tool === "line" ? "Hacé clic y arrastrá para trazar una línea" : tool === "arrow" ? "Hacé clic y arrastrá para trazar una flecha" : "Hacé clic donde querés el texto"}
          </p>
        </div>
      </div>
    </div>
  );
}
