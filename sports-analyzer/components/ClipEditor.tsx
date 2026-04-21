"use client";
import React, { useState, useCallback, useMemo } from "react";
import { Scissors, Play, Download, Check, ChevronDown, ChevronUp, Film, Filter } from "lucide-react";
import { getEventConfig } from "@/types";
import type { SportEvent } from "@/types";

interface PlayerHandle {
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
}

interface ClipEditorProps {
  events: SportEvent[];
  playerRef: React.RefObject<PlayerHandle>;
  onUpdateClip: (eventId: string, clip_start: number, clip_end: number) => void;
}

function fmt(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), ds = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${ds}`;
}

type FilterState = { tipo: string; subtype: string; result: string };

export default function ClipEditor({ events, playerRef, onUpdateClip }: ClipEditorProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterState>({ tipo: "", subtype: "", result: "" });
  // per-event: seconds before the timestamp (start offset)
  const [startOffsets, setStartOffsets] = useState<Record<string, string>>({});
  // per-event: duration in seconds
  const [durations, setDurations] = useState<Record<string, string>>({});

  const clips = useMemo(() => {
    let list = [...events];
    if (filter.tipo)    list = list.filter(e => e.tipo === filter.tipo);
    if (filter.subtype) list = list.filter(e => e.subtype === filter.subtype);
    if (filter.result)  list = list.filter(e => (e.result ?? e.resultado ?? null) === filter.result);
    return list;
  }, [events, filter]);

  const uniqueTipos = useMemo(() => Array.from(new Set(events.map(e => e.tipo))), [events]);

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => setSelected(
    selected.size === clips.length && clips.length > 0 ? new Set() : new Set(clips.map(e => e.id))
  );

  const handlePreview = useCallback((event: SportEvent) => {
    playerRef.current?.seekTo(event.clip_start ?? Math.max(0, event.time - 5));
  }, [playerRef]);

  // Change start offset (seconds before timestamp)
  const handleStartOffset = useCallback((event: SportEvent, val: string) => {
    setStartOffsets(prev => ({ ...prev, [event.id]: val }));
    const secs = parseFloat(val);
    if (!isNaN(secs) && secs >= 0) {
      const start = Math.max(0, event.time - secs);
      const end   = event.clip_end ?? event.time;
      onUpdateClip(event.id, start, Math.max(start + 0.5, end));
    }
  }, [onUpdateClip]);

  // Change duration (total clip length)
  const handleDuration = useCallback((event: SportEvent, val: string) => {
    setDurations(prev => ({ ...prev, [event.id]: val }));
    const secs = parseFloat(val);
    if (!isNaN(secs) && secs > 0) {
      const start = event.clip_start ?? Math.max(0, event.time - 5);
      onUpdateClip(event.id, start, start + secs);
    }
  }, [onUpdateClip]);

  // Set clip_start to current video time
  const handleSetStartNow = useCallback((event: SportEvent) => {
    const t = playerRef.current?.getCurrentTime() ?? event.time;
    const end = event.clip_end ?? event.time;
    onUpdateClip(event.id, t, Math.max(t + 0.5, end));
  }, [playerRef, onUpdateClip]);

  // Set clip_end to current video time
  const handleSetEndNow = useCallback((event: SportEvent) => {
    const t = playerRef.current?.getCurrentTime() ?? event.time;
    const start = event.clip_start ?? Math.max(0, event.time - 5);
    onUpdateClip(event.id, start, Math.max(start + 0.5, t));
  }, [playerRef, onUpdateClip]);

  const handleExport = useCallback(() => {
    if (selected.size === 0) return;
    const toExport = clips
      .filter(e => selected.has(e.id))
      .map((e, i) => {
        const cfg = getEventConfig(e.tipo);
        const start = parseFloat((e.clip_start ?? Math.max(0, e.time - 5)).toFixed(2));
        const end   = parseFloat((e.clip_end   ?? e.time).toFixed(2));
        return {
          index: i + 1,
          label: `${cfg.emoji} ${e.tipo}${e.subtype ? ` (${e.subtype})` : ""}${e.player_name ? ` — ${e.player_name}` : ""}`,
          tipo: e.tipo,
          subtype: e.subtype ?? null,
          result: e.result ?? e.resultado ?? null,
          player_name: e.player_name ?? null,
          clip_start: start,
          clip_end: end,
          duration_seconds: parseFloat(Math.max(0, end - start).toFixed(2)),
          ffmpeg: `ffmpeg -i INPUT.mp4 -ss ${start} -to ${end} -c copy clip_${String(i+1).padStart(2,"0")}_${e.tipo.replace(/\s+/g,"_")}.mp4`,
        };
      });

    const blob = new Blob(
      [JSON.stringify({ exported_at: new Date().toISOString(), total: toExport.length, clips: toExport }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clips_${new Date().toISOString().slice(0,10)}.json`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [clips, selected]);

  return (
    <div className="rounded-2xl bg-[#0d1117] border border-[#21262d] overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#161b22] transition-colors">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-violet-400" />
          <span className="font-display font-semibold tracking-widest text-xs text-[#484f58] uppercase">Editor de Clips</span>
          <span className="text-xs font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
            {events.length}
          </span>
          {selected.size > 0 && (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              {selected.size} sel.
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#484f58]" /> : <ChevronDown className="w-4 h-4 text-[#484f58]" />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">

          {/* Filters */}
          <div className="flex gap-1.5 flex-wrap items-center">
            <Filter className="w-3.5 h-3.5 text-[#484f58]" />
            <select value={filter.tipo} onChange={e => setFilter(f=>({...f,tipo:e.target.value}))}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-xs font-mono text-[#8b949e] focus:outline-none">
              <option value="">Todos los tipos</option>
              {uniqueTipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filter.subtype} onChange={e => setFilter(f=>({...f,subtype:e.target.value}))}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-xs font-mono text-[#8b949e] focus:outline-none">
              <option value="">OF + DEF</option>
              <option value="ofensivo">⚔️ Ofensivo</option>
              <option value="defensivo">🛡️ Defensivo</option>
            </select>
            <select value={filter.result} onChange={e => setFilter(f=>({...f,result:e.target.value}))}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1 text-xs font-mono text-[#8b949e] focus:outline-none">
              <option value="">OK + ERR</option>
              <option value="correcto">✓ OK</option>
              <option value="incorrecto">✗ ERR</option>
            </select>
            {(filter.tipo||filter.subtype||filter.result) && (
              <button onClick={()=>setFilter({tipo:"",subtype:"",result:""})}
                className="text-xs font-mono text-[#484f58] hover:text-white transition-colors">✕</button>
            )}
          </div>

          {/* Select all + export */}
          <div className="flex items-center justify-between">
            <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs font-mono text-[#484f58] hover:text-white transition-colors">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected.size===clips.length&&clips.length>0?"bg-violet-500 border-violet-500":"border-[#30363d]"}`}>
                {selected.size===clips.length&&clips.length>0&&<Check className="w-2.5 h-2.5 text-white"/>}
              </div>
              {selected.size===clips.length&&clips.length>0 ? "Deseleccionar todo" : "Seleccionar todo"}
            </button>
            {selected.size > 0 && (
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/15 border border-violet-500/40 hover:bg-violet-500/25 rounded-lg text-violet-400 font-display font-bold tracking-widest text-xs transition-all active:scale-95">
                <Download className="w-3.5 h-3.5" /> EXPORTAR {selected.size}
              </button>
            )}
          </div>

          {/* Clip list */}
          {clips.length === 0 ? (
            <div className="text-center py-6 text-[#484f58] font-mono text-xs">
              <Film className="w-8 h-8 mx-auto mb-2 opacity-30"/>
              {events.length===0 ? "Marcá eventos para ver clips acá" : "Sin clips con estos filtros"}
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto custom-scroll pr-1">
              {clips.map(event => {
                const cfg = getEventConfig(event.tipo);
                const start   = event.clip_start ?? Math.max(0, event.time - 5);
                const end     = event.clip_end   ?? event.time;
                const durSecs = Math.max(0, end - start);
                const result  = event.result ?? event.resultado ?? null;

                return (
                  <div key={event.id}
                    className="flex flex-col gap-2 p-3 rounded-xl border border-[#21262d] bg-[#161b22] hover:border-[#30363d] transition-all">

                    {/* Row 1: checkbox + label */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleSelect(event.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${selected.has(event.id)?"bg-violet-500 border-violet-500":"border-[#30363d]"}`}>
                        {selected.has(event.id)&&<Check className="w-2.5 h-2.5 text-white"/>}
                      </button>
                      <span style={{fontSize:"1rem"}}>{cfg.emoji}</span>
                      <span className={`font-display font-bold text-xs ${cfg.color} truncate flex-1`}>
                        {event.tipo.toUpperCase()}
                        {event.subtype && <span className="text-[#484f58] font-normal ml-1">· {event.subtype}</span>}
                      </span>
                      {event.player_name && <span className="text-xs font-mono text-cyan-400 shrink-0">👤 {event.player_name}</span>}
                      {result && (
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded border shrink-0 ${result==="correcto"?"bg-green-500/10 border-green-500/20 text-green-400":"bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>
                          {result==="correcto"?"✓":"✗"}
                        </span>
                      )}
                    </div>

                    {/* Row 2: timeline */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-emerald-400 tabular-nums w-16 shrink-0">{fmt(start)}</span>
                      <div className="flex-1 h-1 bg-[#21262d] rounded-full">
                        <div className="h-full bg-violet-500/50 rounded-full w-full"/>
                      </div>
                      <span className="text-rose-400 tabular-nums w-16 text-right shrink-0">{fmt(end)}</span>
                      <span className="text-[#484f58] shrink-0">{durSecs.toFixed(1)}s</span>
                    </div>

                    {/* Row 3: timing inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#484f58] font-mono text-xs shrink-0">Antes:</span>
                        <input
                          type="number" min={0} max={60} step={0.5}
                          value={startOffsets[event.id] ?? (event.time - start).toFixed(1)}
                          onChange={e => handleStartOffset(event, e.target.value)}
                          className="w-14 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-white font-mono text-xs text-center focus:outline-none focus:border-emerald-500/50 transition-colors"
                          title="Segundos antes del evento"
                        />
                        <span className="text-[#484f58] font-mono text-xs">s</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#484f58] font-mono text-xs shrink-0">Duración:</span>
                        <input
                          type="number" min={0.5} max={120} step={0.5}
                          value={durations[event.id] ?? durSecs.toFixed(1)}
                          onChange={e => handleDuration(event, e.target.value)}
                          className="w-14 bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-white font-mono text-xs text-center focus:outline-none focus:border-violet-500/50 transition-colors"
                          title="Duración total del clip en segundos"
                        />
                        <span className="text-[#484f58] font-mono text-xs">s</span>
                      </div>
                    </div>

                    {/* Row 4: quick actions */}
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => handlePreview(event)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-[#21262d] border border-[#30363d] hover:border-[#484f58] rounded-lg text-[#8b949e] hover:text-white font-mono text-xs transition-all">
                        <Play className="w-3 h-3"/> Preview
                      </button>
                      <button onClick={() => handleSetStartNow(event)}
                        className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg text-emerald-400 font-mono text-xs transition-all"
                        title="Fijar inicio en el tiempo actual del video">
                        ← INICIO AQUÍ
                      </button>
                      <button onClick={() => handleSetEndNow(event)}
                        className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 rounded-lg text-rose-400 font-mono text-xs transition-all"
                        title="Fijar fin en el tiempo actual del video">
                        FIN AQUÍ →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
