"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import { Type, Pen, Square, ArrowRight, Trash2, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";

export interface Annotation {
  id: string;
  type: "text" | "draw" | "rect" | "arrow";
  // video timestamp when annotation appears
  start_time: number;
  // how many seconds it stays visible
  duration: number;
  // for text
  text?: string;
  x: number;
  y: number;
  // for draw/rect/arrow
  points?: { x: number; y: number }[];
  x2?: number;
  y2?: number;
  color: string;
  fontSize?: number;
}

interface AnnotationEditorProps {
  annotations: Annotation[];
  currentTime: number;
  videoWidth: number;
  videoHeight: number;
  onAdd: (a: Annotation) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
}

type Tool = "text" | "draw" | "rect" | "arrow";
const COLORS = ["#00ff88","#f43f5e","#38bdf8","#fbbf24","#ffffff","#a78bfa"];

function fmt(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function uid() { return Math.random().toString(36).slice(2); }

export default function AnnotationEditor({
  annotations, currentTime, videoWidth, videoHeight,
  onAdd, onDelete, onUpdate,
}: AnnotationEditorProps) {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState<Tool>("text");
  const [color, setColor] = useState(COLORS[0]);
  const [duration, setDuration] = useState(3);
  const [textInput, setTextInput] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{x:number;y:number}[]>([]);
  const [rectStart, setRectStart] = useState<{x:number;y:number}|null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Annotations visible at currentTime
  const visible = annotations.filter(a =>
    currentTime >= a.start_time && currentTime < a.start_time + a.duration
  );

  // Draw visible annotations on preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showOverlay) return;
    visible.forEach(a => drawAnnotation(ctx, a));
  }, [visible, showOverlay]);

  function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation) {
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (a.type === "text" && a.text) {
      ctx.font = `bold ${a.fontSize ?? 18}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = a.color;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 3;
      ctx.strokeText(a.text, a.x, a.y);
      ctx.fillText(a.text, a.x, a.y);
    }

    if (a.type === "draw" && a.points && a.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(a.points[0].x, a.points[0].y);
      a.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    if (a.type === "rect" && a.x2 !== undefined && a.y2 !== undefined) {
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(a.x, a.y, a.x2 - a.x, a.y2 - a.y);
    }

    if (a.type === "arrow" && a.x2 !== undefined && a.y2 !== undefined) {
      const dx = a.x2 - a.x, dy = a.y2 - a.y;
      const len = Math.sqrt(dx*dx + dy*dy);
      const ux = dx/len, uy = dy/len;
      const hw = 12, hl = 18;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x2 - ux*hl, a.y2 - uy*hl);
      ctx.stroke();
      // arrowhead
      ctx.beginPath();
      ctx.moveTo(a.x2, a.y2);
      ctx.lineTo(a.x2 - ux*hl - uy*hw, a.y2 - uy*hl + ux*hw);
      ctx.lineTo(a.x2 - ux*hl + uy*hw, a.y2 - uy*hl - ux*hw);
      ctx.closePath();
      ctx.fill();
    }
  }

  function getPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const pos = getPos(e);
    if (tool === "text") {
      if (!textInput.trim()) return;
      onAdd({ id: uid(), type: "text", start_time: currentTime, duration, text: textInput, x: pos.x, y: pos.y, color, fontSize: 18 });
      setTextInput("");
      return;
    }
    setDrawing(true);
    if (tool === "draw") setCurrentPoints([pos]);
    if (tool === "rect" || tool === "arrow") setRectStart(pos);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const pos = getPos(e);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";

    if (tool === "draw") {
      const pts = [...currentPoints, pos];
      setCurrentPoints(pts);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
    if (tool === "rect" && rectStart) {
      ctx.strokeRect(rectStart.x, rectStart.y, pos.x - rectStart.x, pos.y - rectStart.y);
    }
    if (tool === "arrow" && rectStart) {
      const dx = pos.x - rectStart.x, dy = pos.y - rectStart.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const ux = dx/len, uy = dy/len;
      const hl = 16, hw = 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(rectStart.x, rectStart.y);
      ctx.lineTo(pos.x - ux*hl, pos.y - uy*hl);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x - ux*hl - uy*hw, pos.y - uy*hl + ux*hw);
      ctx.lineTo(pos.x - ux*hl + uy*hw, pos.y - uy*hl - ux*hw);
      ctx.closePath();
      ctx.fill();
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const pos = getPos(e);
    setDrawing(false);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (tool === "draw" && currentPoints.length > 1) {
      onAdd({ id: uid(), type: "draw", start_time: currentTime, duration, x: 0, y: 0, points: currentPoints, color });
    }
    if (tool === "rect" && rectStart) {
      onAdd({ id: uid(), type: "rect", start_time: currentTime, duration, x: rectStart.x, y: rectStart.y, x2: pos.x, y2: pos.y, color });
    }
    if (tool === "arrow" && rectStart) {
      onAdd({ id: uid(), type: "arrow", start_time: currentTime, duration, x: rectStart.x, y: rectStart.y, x2: pos.x, y2: pos.y, color });
    }
    setCurrentPoints([]);
    setRectStart(null);
  }

  const W = videoWidth || 640;
  const H = videoHeight || 360;

  return (
    <div className="flex flex-col gap-3">
      {/* Canvas overlay — always rendered when open */}
      {open && (
        <div className="relative rounded-xl overflow-hidden border border-violet-500/30 bg-black" style={{aspectRatio:`${W}/${H}`}}>
          {/* Preview of current visible annotations */}
          <canvas
            ref={previewCanvasRef}
            width={W} height={H}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          {/* Drawing canvas */}
          <canvas
            ref={canvasRef}
            width={W} height={H}
            className={`absolute inset-0 w-full h-full ${tool === "text" ? "cursor-crosshair" : "cursor-crosshair"}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />
          <div className="absolute top-2 left-2 text-xs font-mono text-violet-400 bg-black/70 px-2 py-1 rounded">
            {tool === "text" ? "Click para colocar texto" : "Click y arrastrá para dibujar"}
          </div>
          {visible.length > 0 && (
            <div className="absolute top-2 right-2 text-xs font-mono text-[#484f58] bg-black/70 px-2 py-1 rounded">
              {visible.length} activa{visible.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {/* Collapsible header */}
      <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden">
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#161b22] transition-colors">
          <div className="flex items-center gap-2">
            <Pen className="w-4 h-4 text-violet-400" />
            <span className="font-display font-semibold tracking-widest text-xs text-[#484f58] uppercase">Anotaciones</span>
            <span className="text-xs font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
              {annotations.length}
            </span>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-[#484f58]" /> : <ChevronDown className="w-4 h-4 text-[#484f58]" />}
        </button>

        {open && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {/* Tools row */}
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { t: "text" as Tool,  icon: <Type className="w-3.5 h-3.5" />,        label: "TEXTO"    },
                { t: "draw" as Tool,  icon: <Pen className="w-3.5 h-3.5" />,         label: "DIBUJAR"  },
                { t: "rect" as Tool,  icon: <Square className="w-3.5 h-3.5" />,      label: "RECUADRO" },
                { t: "arrow" as Tool, icon: <ArrowRight className="w-3.5 h-3.5" />,  label: "FLECHA"   },
              ]).map(({ t, icon, label }) => (
                <button key={t} onClick={() => setTool(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs transition-all ${tool === t ? "bg-violet-500/20 border-violet-500/50 text-violet-300" : "bg-[#161b22] border-[#30363d] text-[#484f58] hover:text-white"}`}>
                  {icon}{label}
                </button>
              ))}

              <button onClick={() => setShowOverlay(s => !s)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#30363d] bg-[#161b22] text-[#484f58] hover:text-white font-mono text-xs transition-all ml-auto">
                {showOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Color + duration */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs font-mono text-[#484f58]">Duración:</span>
                <input
                  type="number" min={0.5} max={60} step={0.5} value={duration}
                  onChange={e => setDuration(parseFloat(e.target.value) || 3)}
                  className="w-16 bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-white font-mono text-xs text-center focus:outline-none focus:border-violet-500/50 transition-colors"
                />
                <span className="text-xs font-mono text-[#484f58]">seg</span>
              </div>
            </div>

            {/* Text input */}
            {tool === "text" && (
              <div className="flex gap-2">
                <input
                  type="text" placeholder="Escribí el texto → click en el canvas para colocarlo"
                  value={textInput} onChange={e => setTextInput(e.target.value)}
                  className="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white placeholder-[#484f58] font-mono text-xs focus:outline-none focus:border-violet-500/50 transition-colors"
                />
              </div>
            )}

            {/* Annotations list */}
            {annotations.length > 0 && (
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scroll">
                <p className="text-[10px] font-mono text-[#484f58] uppercase tracking-widest mb-1">Anotaciones guardadas</p>
                {annotations.map(a => (
                  <div key={a.id}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161b22] border border-[#21262d] hover:border-[#30363d] transition-all">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                    <span className="font-mono text-xs text-[#8b949e] shrink-0">{fmt(a.start_time)}</span>
                    <span className="font-mono text-xs text-white truncate flex-1">
                      {a.type === "text" ? `"${a.text}"` : a.type.toUpperCase()}
                    </span>
                    {/* Duration editable inline */}
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number" min={0.5} max={60} step={0.5} value={a.duration}
                        onChange={e => onUpdate(a.id, { duration: parseFloat(e.target.value) || 1 })}
                        className="w-12 bg-[#0d1117] border border-[#30363d] rounded px-1 py-0.5 text-white font-mono text-xs text-center focus:outline-none focus:border-violet-500/40 transition-colors"
                        title="Duración en segundos"
                      />
                      <span className="text-[#484f58] font-mono text-xs">s</span>
                    </div>
                    <button onClick={() => onDelete(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#484f58] hover:text-rose-400 transition-all shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
