"use client";

import React, { useRef, useCallback, useState } from "react";
import { Activity, Download, RotateCcw } from "lucide-react";
import VideoPlayer, { VideoPlayerHandle } from "@/components/VideoPlayer";
import EventButtons from "@/components/EventButtons";
import EventList from "@/components/EventList";
import { useEvents } from "@/hooks/useEvents";
import type { EventTipo, EventResultado, VideoMode } from "@/types";

export default function Home() {
  const videoRef = useRef<VideoPlayerHandle>(null);
  const [videoMode, setVideoMode] = useState<VideoMode>(null);
  const { events, addEvent, deleteEvent, updateResultado, clearAll } =
    useEvents();

  const handleEvent = useCallback(
    (tipo: EventTipo, resultado: EventResultado) => {
      const time = videoRef.current?.getCurrentTime() ?? 0;
      addEvent(time, tipo, resultado);
    },
    [addEvent]
  );

  const handleSeek = useCallback((time: number) => {
    videoRef.current?.seekTo(time);
  }, []);

  // Export events as JSON
  const handleExport = useCallback(() => {
    const data = JSON.stringify(events, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eventos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  return (
    <div className="min-h-screen bg-[#080b0f]">
      {/* Top nav */}
      <header className="border-b border-[#21262d] bg-[#0d1117]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-[#00ff88]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-white tracking-widest text-lg">
                SPORTTAG
              </span>
              <span className="text-[#484f58] font-mono text-xs hidden sm:block">
                v1.0
              </span>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {events.length > 0 && (
              <>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 text-xs font-mono text-[#8b949e] hover:text-white border border-[#30363d] hover:border-[#484f58] px-3 py-1.5 rounded-lg bg-[#161b22] hover:bg-[#21262d] transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:block">EXPORTAR JSON</span>
                </button>
                <button
                  onClick={() => {
                    if (confirm("¿Borrar todos los eventos?")) clearAll();
                  }}
                  className="flex items-center gap-1.5 text-xs font-mono text-[#8b949e] hover:text-rose-400 border border-[#30363d] hover:border-rose-500/40 px-3 py-1.5 rounded-lg bg-[#161b22] hover:bg-rose-500/5 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:block">RESET</span>
                </button>
              </>
            )}

            {/* Event counter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded-lg">
              <span className="font-mono font-bold text-[#00ff88] text-sm tabular-nums">
                {events.length}
              </span>
              <span className="text-[#484f58] text-xs font-mono hidden sm:block">
                eventos
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        {/* Left column: video + buttons */}
        <div className="flex flex-col gap-5">
          {/* Video section */}
          <section className="rounded-2xl bg-[#0d1117] border border-[#21262d] p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
              <span className="font-display font-semibold tracking-widest text-xs text-[#484f58] uppercase">
                Reproductor
              </span>
            </div>
            <VideoPlayer ref={videoRef} onModeChange={setVideoMode} />
          </section>

          {/* Event buttons section */}
          <section className="rounded-2xl bg-[#0d1117] border border-[#21262d] p-5">
            <EventButtons
              onEvent={handleEvent}
              disabled={!videoMode}
            />
          </section>

          {/* Event list — visible on mobile here, hidden on xl */}
          <section className="rounded-2xl bg-[#0d1117] border border-[#21262d] p-5 xl:hidden">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[#fbbf24]" />
              <span className="font-display font-semibold tracking-widest text-xs text-[#484f58] uppercase">
                Timeline de Eventos
              </span>
            </div>
            <EventList
              events={events}
              onSeek={handleSeek}
              onDelete={deleteEvent}
              onUpdateResultado={updateResultado}
              onClearAll={clearAll}
            />
          </section>
        </div>

        {/* Right column: event list (desktop only) */}
        <aside className="hidden xl:flex flex-col gap-5">
          <section className="rounded-2xl bg-[#0d1117] border border-[#21262d] p-5 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[#fbbf24]" />
              <span className="font-display font-semibold tracking-widest text-xs text-[#484f58] uppercase">
                Timeline de Eventos
              </span>
            </div>
            <div className="flex-1">
              <EventList
                events={events}
                onSeek={handleSeek}
                onDelete={deleteEvent}
                onUpdateResultado={updateResultado}
                onClearAll={clearAll}
              />
            </div>
          </section>

          {/* Instructions card */}
          <div className="rounded-xl border border-[#21262d] bg-[#0d1117] p-4">
            <p className="font-display font-semibold text-xs tracking-widest text-[#484f58] mb-3 uppercase">
              Cómo usar
            </p>
            <ol className="flex flex-col gap-2">
              {[
                "Cargá un video local o pegá un link de YouTube",
                "Reproducí el video normalmente",
                "Cuando detectes una acción, hacé click en el botón correspondiente",
                "Seleccioná el resultado (correcto / incorrecto)",
                "Click en un evento de la lista para volver 5s antes",
              ].map((step, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center font-mono text-[10px] text-[#484f58] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-[#8b949e] text-xs font-body leading-relaxed">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#21262d] mt-8 py-4 text-center">
        <p className="text-[#30363d] font-mono text-xs">
          SPORTTAG · Análisis de Video Deportivo · Datos guardados en localStorage
        </p>
      </footer>
    </div>
  );
}
