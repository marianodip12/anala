"use client";
import React, { useState, useRef } from "react";
import { Type, Pen, Square, ArrowRight, Trash2, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import type { Annotation } from "@/types";

interface AnnotationEditorProps {
  annotations: Annotation[];
  currentTime: number;
  // The actual video element or YouTube container ref for getting canvas dimensions
  videoContainerRef: React.RefObject<HTMLDivElement>;
  onAdd: (a: Annotation) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
}

type Tool = "text" | "draw" | "rect" | "arrow";
const COLORS = ["#00ff88","#f43f5e","#38bdf8","#fbbf24","#ffffff","#a78bfa"];
function uid() { return Math.random().toString(36).slice(2,10); }

function fmt(t: number) {
  const m = Math.floor(t/60), s = Math.floor(t%60);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export default function AnnotationEditor({
  annotations, currentTime, videoContainerRef, onAdd, onDelete, onUpdate,
}: AnnotationEditorProps) {
  const [open, setOpen]         = useState(false);
  const [tool, setTool]         = useState<Tool>("text");
  const [color, setColor]       = useState(COLORS[0]);
  const [duration, setDuration] = useState(3);
  const [textInput, setTextInput] = useState("");
  const [drawing, setDrawing]   = useState(false);
  const [points, setPoints]     = useState<{x:number;y:number}[]>([]);
  const [startPt, setStartPt]   = useState<{x:number;y:number}|null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  // The drawing canvas overlays on the video container when open + drawing mode
  const getVideoContainer = () => videoContainerRef.current;

  function getPos(e: React.MouseEvent<HTMLCanvasElement>): {x:number;y:number} {
    const c = drawCanvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width)  * 640,
      y: ((e.clientY - r.top)  / r.height) * 360,
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const pos = getPos(e);
    if (tool === "text") {
      if (!textInput.trim()) return;
      onAdd({ id: uid(), type:"text", start_time: currentTime, duration, text: textInput, x: pos.x, y: pos.y, color, fontSize: 20 });
      setTextInput("");
      return;
    }
    setDrawing(true);
    if (tool === "draw")                    setPoints([pos]);
    if (tool === "rect" || tool === "arrow") setStartPt(pos);
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const pos = getPos(e);
    const c = drawCanvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";

    if (tool === "draw") {
      const pts = [...points, pos]; setPoints(pts);
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
    }
    if (tool === "rect" && startPt) {
      ctx.strokeRect(startPt.x, startPt.y, pos.x-startPt.x, pos.y-startPt.y);
    }
    if (tool === "arrow" && startPt) {
      const dx=pos.x-startPt.x, dy=pos.y-startPt.y;
      const len=Math.sqrt(dx*dx+dy*dy)||1;
      const ux=dx/len, uy=dy/len, hl=16, hw=10;
      ctx.beginPath(); ctx.moveTo(startPt.x, startPt.y);
      ctx.lineTo(pos.x-ux*hl, pos.y-uy*hl); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pos.x,pos.y);
      ctx.lineTo(pos.x-ux*hl-uy*hw, pos.y-uy*hl+ux*hw);
      ctx.lineTo(pos.x-ux*hl+uy*hw, pos.y-uy*hl-ux*hw);
      ctx.closePath(); ctx.fill();
    }
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const pos = getPos(e);
    setDrawing(false);
    const c = drawCanvasRef.current!;
    c.getContext("2d")!.clearRect(0,0,c.width,c.height);

    if (tool === "draw" && points.length > 1)
      onAdd({ id:uid(), type:"draw", start_time:currentTime, duration, x:0, y:0, points, color });
    if (tool === "rect" && startPt)
      onAdd({ id:uid(), type:"rect", start_time:currentTime, duration, x:startPt.x, y:startPt.y, x2:pos.x, y2:pos.y, color });
    if (tool === "arrow" && startPt)
      onAdd({ id:uid(), type:"arrow", start_time:currentTime, duration, x:startPt.x, y:startPt.y, x2:pos.x, y2:pos.y, color });
    setPoints([]); setStartPt(null);
  }

  const isDrawingMode = open && tool !== "text";
  const visibleNow = annotations.filter(a => currentTime >= a.start_time && currentTime < a.start_time + a.duration);

  return (
    <>
      {/* Drawing canvas — absolute overlay on top of video when active */}
      {open && (
        <div className="relative w-full" style={{marginTop:"-3.5rem", pointerEvents:"none"}}>
          {/* This sits on top of the video player section */}
        </div>
      )}

      <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden">
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#161b22] transition-colors">
          <div className="flex items-center gap-2">
            <Pen className="w-4 h-4 text-violet-400"/>
            <span className="font-display font-semibold tracking-widest text-xs text-[#484f58] uppercase">Anotaciones</span>
            <span className="text-xs font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
              {annotations.length}
            </span>
            {visibleNow.length > 0 && (
              <span className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                {visibleNow.length} activa{visibleNow.length>1?"s":""}
              </span>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-[#484f58]"/> : <ChevronDown className="w-4 h-4 text-[#484f58]"/>}
        </button>

        {open && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {/* Info */}
            <p className="text-xs font-mono text-[#484f58] bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
              Las anotaciones se dibujan <span className="text-violet-400">directamente sobre el video</span>.
              Elegí la herramienta y usá el canvas de arriba.
            </p>

            {/* Tools */}
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { t:"text"  as Tool, icon:<Type className="w-3.5 h-3.5"/>,       label:"TEXTO"    },
                { t:"draw"  as Tool, icon:<Pen className="w-3.5 h-3.5"/>,        label:"DIBUJAR"  },
                { t:"rect"  as Tool, icon:<Square className="w-3.5 h-3.5"/>,     label:"RECUADRO" },
                { t:"arrow" as Tool, icon:<ArrowRight className="w-3.5 h-3.5"/>, label:"FLECHA"   },
              ]).map(({t,icon,label}) => (
                <button key={t} onClick={() => setTool(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs transition-all ${tool===t?"bg-violet-500/20 border-violet-500/50 text-violet-300":"bg-[#161b22] border-[#30363d] text-[#484f58] hover:text-white"}`}>
                  {icon}{label}
                </button>
              ))}
            </div>

            {/* Color + duration */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex gap-1.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${color===c?"border-white scale-110":"border-transparent"}`}
                    style={{background:c}}/>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs font-mono text-[#484f58]">Duración:</span>
                <input type="number" min={0.5} max={60} step={0.5} value={duration}
                  onChange={e => setDuration(parseFloat(e.target.value)||3)}
                  className="w-14 bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-white font-mono text-xs text-center focus:outline-none focus:border-violet-500/50 transition-colors"/>
                <span className="text-xs font-mono text-[#484f58]">seg</span>
              </div>
            </div>

            {/* Text input */}
            {tool === "text" && (
              <input type="text" placeholder="Escribí el texto → hacé click en el video"
                value={textInput} onChange={e => setTextInput(e.target.value)}
                className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white placeholder-[#484f58] font-mono text-xs focus:outline-none focus:border-violet-500/50 transition-colors"/>
            )}

            {/* Annotations list */}
            {annotations.length > 0 && (
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scroll">
                <p className="text-[10px] font-mono text-[#484f58] uppercase tracking-widest mb-1">Guardadas</p>
                {annotations.map(a => (
                  <div key={a.id}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161b22] border border-[#21262d] hover:border-[#30363d] transition-all">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:a.color}}/>
                    <span className="font-mono text-xs text-[#8b949e] shrink-0 w-10">{fmt(a.start_time)}</span>
                    <span className="font-mono text-xs text-white truncate flex-1">
                      {a.type==="text" ? `"${a.text}"` : a.type.toUpperCase()}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" min={0.5} max={60} step={0.5} value={a.duration}
                        onChange={e => onUpdate(a.id, {duration: parseFloat(e.target.value)||1})}
                        className="w-12 bg-[#0d1117] border border-[#30363d] rounded px-1 py-0.5 text-white font-mono text-xs text-center focus:outline-none focus:border-violet-500/40"
                        title="Duración en segundos"/>
                      <span className="text-[#484f58] font-mono text-xs">s</span>
                    </div>
                    <button onClick={() => onDelete(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#484f58] hover:text-rose-400 transition-all shrink-0">
                      <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
