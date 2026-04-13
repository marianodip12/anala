"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { Trash2, Check, X, Minus, ListVideo } from "lucide-react";
import { EVENT_CONFIGS } from "@/types";
import type { SportEvent, EventResultado } from "@/types";

interface EventListProps {
  events: SportEvent[];
  onSeek: (time: number) => void;
  onDelete: (id: string) => void;
  onUpdateResultado: (id: string, resultado: EventResultado) => void;
  onClearAll: () => void;
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ds = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ds}`;
}

function ResultadoBadge({ resultado }: { resultado: EventResultado }) {
  if (resultado === "correcto") {
    return (
      <span className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 bg-green-500/15 border border-green-500/30 rounded text-green-400">
        <Check className="w-3 h-3" />
        OK
      </span>
    );
  }
  if (resultado === "incorrecto") {
    return (
      <span className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 bg-rose-500/15 border border-rose-500/30 rounded text-rose-400">
        <X className="w-3 h-3" />
        ERR
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 bg-pitch-700 border border-pitch-600 rounded text-pitch-500">
      <Minus className="w-3 h-3" />
      —
    </span>
  );
}

function getEventConfig(tipo: string) {
  return EVENT_CONFIGS.find((c) => c.tipo === tipo) ?? EVENT_CONFIGS[0];
}

export default function EventList({
  events,
  onSeek,
  onDelete,
  onUpdateResultado,
  onClearAll,
}: EventListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(events.length);

  // Auto-scroll to last event when new one added
  useEffect(() => {
    if (events.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = events.length;
  }, [events.length]);

  const handleSeek = useCallback(
    (time: number) => {
      onSeek(Math.max(0, time - 5));
    },
    [onSeek]
  );

  // Summary stats
  const stats = React.useMemo(() => {
    const total = events.length;
    const correctos = events.filter((e) => e.resultado === "correcto").length;
    const incorrectos = events.filter(
      (e) => e.resultado === "incorrecto"
    ).length;
    const byTipo = EVENT_CONFIGS.map((c) => ({
      tipo: c.tipo,
      count: events.filter((e) => e.tipo === c.tipo).length,
      config: c,
    })).filter((x) => x.count > 0);
    return { total, correctos, incorrectos, byTipo };
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-pitch-800 border border-pitch-600 flex items-center justify-center">
          <ListVideo className="w-6 h-6 text-pitch-500" />
        </div>
        <div>
          <p className="text-pitch-400 font-display font-semibold tracking-wide">
            SIN EVENTOS
          </p>
          <p className="text-pitch-500 text-xs font-mono mt-1">
            Reproducí el video y marcá acciones
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header with stats and clear */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-display font-bold text-white tracking-widest text-sm">
            {stats.total} EVENTOS
          </span>
          {stats.correctos > 0 && (
            <span className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 bg-green-500/10 border border-green-500/25 rounded text-green-400">
              <Check className="w-3 h-3" />
              {stats.correctos} OK
            </span>
          )}
          {stats.incorrectos > 0 && (
            <span className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 bg-rose-500/10 border border-rose-500/25 rounded text-rose-400">
              <X className="w-3 h-3" />
              {stats.incorrectos} ERR
            </span>
          )}
        </div>

        <button
          onClick={() => {
            if (confirm("¿Borrar todos los eventos?")) onClearAll();
          }}
          className="flex items-center gap-1.5 text-xs text-pitch-500 hover:text-rose-400 font-mono transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          LIMPIAR TODO
        </button>
      </div>

      {/* Quick stats by type */}
      {stats.byTipo.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {stats.byTipo.map(({ tipo, count, config }) => (
            <div
              key={tipo}
              className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg border ${config.borderColor} ${config.bgColor}`}
            >
              <span className={config.color}>{config.emoji}</span>
              <span className={`${config.color} font-semibold`}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Event list */}
      <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto pr-1 custom-scroll">
        {events.map((event, idx) => {
          const config = getEventConfig(event.tipo);
          return (
            <div
              key={event.id}
              className="animate-slide-in group flex items-center gap-3 px-3 py-2.5 rounded-xl bg-pitch-800 border border-pitch-600 hover:border-pitch-500 transition-all"
            >
              {/* Index */}
              <span className="text-pitch-600 font-mono text-xs w-5 text-right shrink-0">
                {idx + 1}
              </span>

              {/* Seek button */}
              <button
                onClick={() => handleSeek(event.time)}
                className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                title="Click para ir a este momento (−5s)"
              >
                {/* Time */}
                <span className="font-mono text-sm tabular-nums text-accent-green shrink-0">
                  {formatTime(event.time)}
                </span>

                {/* Divider */}
                <span className="text-pitch-600">·</span>

                {/* Emoji */}
                <span className="text-base shrink-0">{config.emoji}</span>

                {/* Type */}
                <span
                  className={`font-display font-semibold tracking-wide text-xs truncate ${config.color}`}
                >
                  {event.tipo.toUpperCase()}
                </span>
              </button>

              {/* Resultado badge + toggle */}
              <div className="shrink-0 flex items-center gap-1">
                <button
                  onClick={() => {
                    const next: EventResultado =
                      event.resultado === null
                        ? "correcto"
                        : event.resultado === "correcto"
                        ? "incorrecto"
                        : null;
                    onUpdateResultado(event.id, next);
                  }}
                  title="Click para cambiar resultado"
                  className="hover:opacity-80 transition-opacity"
                >
                  <ResultadoBadge resultado={event.resultado} />
                </button>
              </div>

              {/* Delete button */}
              <button
                onClick={() => onDelete(event.id)}
                className="opacity-0 group-hover:opacity-100 text-pitch-600 hover:text-rose-400 transition-all shrink-0"
                title="Eliminar evento"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
