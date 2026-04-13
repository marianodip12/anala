"use client";

import React, { useState, useCallback } from "react";
import { Check, X, Zap } from "lucide-react";
import { EVENT_CONFIGS } from "@/types";
import type { EventResultado, EventTipo } from "@/types";

interface EventButtonsProps {
  onEvent: (tipo: EventTipo, resultado: EventResultado) => void;
  disabled?: boolean;
}

type PendingEvent = {
  tipo: EventTipo;
  timestamp: number;
} | null;

export default function EventButtons({
  onEvent,
  disabled = false,
}: EventButtonsProps) {
  const [pending, setPending] = useState<PendingEvent>(null);
  const [lastFlash, setLastFlash] = useState<string | null>(null);

  const handleEventClick = useCallback(
    (tipo: EventTipo) => {
      setPending({ tipo, timestamp: Date.now() });
    },
    []
  );

  const handleResultado = useCallback(
    (resultado: EventResultado) => {
      if (!pending) return;
      onEvent(pending.tipo, resultado);
      setLastFlash(pending.tipo);
      setPending(null);
      setTimeout(() => setLastFlash(null), 600);
    },
    [pending, onEvent]
  );

  const handleQuickMark = useCallback(
    (tipo: EventTipo) => {
      onEvent(tipo, null);
      setLastFlash(tipo);
      setTimeout(() => setLastFlash(null), 600);
    },
    [onEvent]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent-yellow" />
          <span className="font-display font-semibold tracking-widest text-xs text-pitch-500 uppercase">
            Marcar Evento
          </span>
        </div>
        {disabled && (
          <span className="text-xs font-mono text-pitch-500 bg-pitch-800 border border-pitch-600 px-2 py-0.5 rounded">
            Cargá un video primero
          </span>
        )}
      </div>

      {/* Pending resultado selector */}
      {pending && (
        <div className="animate-slide-in flex items-center gap-3 p-3 bg-pitch-800 border border-amber-500/40 rounded-xl">
          <div className="flex-1">
            <p className="text-xs text-pitch-500 font-mono mb-0.5">Resultado de:</p>
            <p className="text-white font-display font-semibold tracking-wide">
              {pending.tipo}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleResultado("correcto")}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500/15 border border-green-500/40 hover:bg-green-500/25 rounded-lg text-green-400 font-mono text-sm font-semibold transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              CORRECTO
            </button>
            <button
              onClick={() => handleResultado("incorrecto")}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 rounded-lg text-rose-400 font-mono text-sm font-semibold transition-all"
            >
              <X className="w-3.5 h-3.5" />
              ERROR
            </button>
            <button
              onClick={() => handleResultado(null)}
              className="px-4 py-2 bg-pitch-700 border border-pitch-600 hover:bg-pitch-600 rounded-lg text-pitch-400 font-mono text-sm transition-all"
            >
              SALTAR
            </button>
          </div>
        </div>
      )}

      {/* Event buttons grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {EVENT_CONFIGS.map((config) => {
          const isFlashing = lastFlash === config.tipo;
          return (
            <button
              key={config.tipo}
              disabled={disabled}
              onClick={() => handleEventClick(config.tipo)}
              onDoubleClick={() => handleQuickMark(config.tipo)}
              title={`Click: marcar con resultado | Doble click: marcar rápido`}
              className={`
                relative flex flex-col items-center gap-2 p-4 rounded-xl border
                font-display font-semibold tracking-wide transition-all duration-150
                disabled:opacity-30 disabled:cursor-not-allowed
                active:scale-95
                ${config.bgColor} ${config.borderColor}
                ${isFlashing ? `ring-2 ${config.ringColor} scale-95` : ""}
              `}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ fontSize: "1.6rem", lineHeight: 1 }}
              >
                {config.emoji}
              </div>
              <span
                className={`text-xs leading-tight text-center ${config.color}`}
                style={{ fontSize: "0.65rem", letterSpacing: "0.08em" }}
              >
                {config.label.toUpperCase()}
              </span>
              {isFlashing && (
                <div className="absolute inset-0 rounded-xl bg-white/10 animate-ping-once" />
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-pitch-500 font-mono text-center">
        Click → seleccionar resultado · Doble click → marcar rápido sin resultado
      </p>
    </div>
  );
}
