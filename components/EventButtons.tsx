"use client";
import React, { useState, useCallback } from "react";
import { Check, X, Users, ChevronDown } from "lucide-react";
import { EVENT_CONFIGS, getEventCategory, DOUBLE_EVENTS, SIMPLE_EVENTS, BINARY_EVENTS } from "@/types";
import type { EventTipo, EventSubtype, EventResult, Player } from "@/types";

interface EventButtonsProps {
  players: Player[];
  onEvent: (tipo: EventTipo, subtype: EventSubtype, result: EventResult, playerId: string | null, playerName: string | null) => void;
  disabled?: boolean;
}

type Step = "idle" | "subtype" | "result" | "player";

interface Pending {
  tipo: EventTipo;
  subtype: EventSubtype;
  result: EventResult;
}

const ACTIVE_CONFIGS = EVENT_CONFIGS.filter(c => c.category !== "legacy");
const DOUBLE_CONFIGS = ACTIVE_CONFIGS.filter(c => c.category === "double");
const SIMPLE_CONFIGS = ACTIVE_CONFIGS.filter(c => c.category === "simple");
const BINARY_CONFIGS = ACTIVE_CONFIGS.filter(c => c.category === "binary");

export default function EventButtons({ players, onEvent, disabled = false }: EventButtonsProps) {
  const [step, setStep] = useState<Step>("idle");
  const [pending, setPending] = useState<Pending | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [showPlayerSearch, setShowPlayerSearch] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");

  const doFlash = (tipo: EventTipo) => {
    setFlash(tipo);
    setTimeout(() => setFlash(null), 500);
  };

  const handleClick = useCallback((tipo: EventTipo) => {
    const cat = getEventCategory(tipo);
    if (cat === "binary") {
      // Binary: fire immediately, ask player
      setPending({ tipo, subtype: null, result: null });
      setStep("player");
    } else if (cat === "double") {
      setPending({ tipo, subtype: null, result: null });
      setStep("subtype");
    } else {
      // simple
      setPending({ tipo, subtype: null, result: null });
      setStep("result");
    }
  }, []);

  const handleSubtype = useCallback((subtype: EventSubtype) => {
    setPending(p => p ? { ...p, subtype } : null);
    setStep("result");
  }, []);

  const handleResult = useCallback((result: EventResult) => {
    setPending(p => p ? { ...p, result } : null);
    setStep("player");
  }, []);

  const handleFire = useCallback((playerId: string | null, playerName: string | null) => {
    if (!pending) return;
    onEvent(pending.tipo, pending.subtype, pending.result, playerId, playerName);
    doFlash(pending.tipo);
    setPending(null);
    setStep("idle");
    setSelectedPlayer("");
    setPlayerSearch("");
    setShowPlayerSearch(false);
  }, [pending, onEvent]);

  const handlePlayerSelect = () => {
    if (!selectedPlayer) {
      handleFire(null, null);
    } else {
      const player = players.find(p => p.id === selectedPlayer);
      handleFire(selectedPlayer, player?.name ?? null);
    }
  };

  const cancel = () => { setPending(null); setStep("idle"); setPlayerSearch(""); };

  const filteredPlayers = players.filter(p =>
    p.name.toLowerCase().includes(playerSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3">

      {/* ── Step: subtype ─────────────────────────────────────── */}
      {step === "subtype" && pending && (
        <div className="animate-slide-in flex flex-col gap-3 p-4 bg-[#161b22] border border-violet-500/40 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#484f58] font-mono">Evento:</p>
              <p className="text-white font-display font-bold tracking-wide">{pending.tipo}</p>
            </div>
            <button onClick={cancel} className="text-[#484f58] hover:text-white font-mono text-xs">✕ cancelar</button>
          </div>
          <p className="text-xs text-[#484f58] font-mono uppercase tracking-widest">¿Ofensivo o defensivo?</p>
          <div className="flex gap-3">
            <button onClick={() => handleSubtype("ofensivo")}
              className="flex-1 py-3 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 rounded-xl text-emerald-400 font-display font-bold tracking-widest text-sm transition-all active:scale-95">
              ⚔️ OFENSIVO
            </button>
            <button onClick={() => handleSubtype("defensivo")}
              className="flex-1 py-3 bg-sky-500/15 border border-sky-500/40 hover:bg-sky-500/25 rounded-xl text-sky-400 font-display font-bold tracking-widest text-sm transition-all active:scale-95">
              🛡️ DEFENSIVO
            </button>
          </div>
        </div>
      )}

      {/* ── Step: result ──────────────────────────────────────── */}
      {step === "result" && pending && (
        <div className="animate-slide-in flex flex-col gap-3 p-4 bg-[#161b22] border border-amber-500/40 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#484f58] font-mono">
                {pending.tipo} {pending.subtype ? `· ${pending.subtype.toUpperCase()}` : ""}
              </p>
              <p className="text-white font-display font-bold tracking-wide">¿Resultado?</p>
            </div>
            <button onClick={cancel} className="text-[#484f58] hover:text-white font-mono text-xs">✕ cancelar</button>
          </div>
          <div className="flex gap-3">
            <button onClick={() => handleResult("correcto")}
              className="flex-1 py-3 bg-green-500/15 border border-green-500/40 hover:bg-green-500/25 rounded-xl text-green-400 font-display font-bold tracking-widest text-sm transition-all active:scale-95">
              <Check className="w-4 h-4 inline mr-1" />CORRECTO
            </button>
            <button onClick={() => handleResult("incorrecto")}
              className="flex-1 py-3 bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 rounded-xl text-rose-400 font-display font-bold tracking-widest text-sm transition-all active:scale-95">
              <X className="w-4 h-4 inline mr-1" />ERROR
            </button>
            <button onClick={() => handleResult(null)}
              className="px-4 py-3 bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] rounded-xl text-[#8b949e] font-mono text-sm transition-all active:scale-95">
              —
            </button>
          </div>
        </div>
      )}

      {/* ── Step: player ──────────────────────────────────────── */}
      {step === "player" && pending && (
        <div className="animate-slide-in flex flex-col gap-3 p-4 bg-[#161b22] border border-cyan-500/40 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <p className="text-white font-display font-bold tracking-wide">¿Qué jugador?</p>
            </div>
            <button onClick={cancel} className="text-[#484f58] hover:text-white font-mono text-xs">✕ cancelar</button>
          </div>

          {players.length > 0 ? (
            <>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar jugador..."
                  value={playerSearch}
                  onChange={e => { setPlayerSearch(e.target.value); setShowPlayerSearch(true); }}
                  onFocus={() => setShowPlayerSearch(true)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white placeholder-[#484f58] font-mono text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
                />
                {showPlayerSearch && filteredPlayers.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    {filteredPlayers.map(p => (
                      <button key={p.id}
                        onClick={() => { setSelectedPlayer(p.id); setPlayerSearch(p.name); setShowPlayerSearch(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-[#21262d] text-white font-mono text-sm transition-colors flex items-center gap-2">
                        {p.number && <span className="text-[#484f58] text-xs">#{p.number}</span>}
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handlePlayerSelect}
                  className="flex-1 py-2.5 bg-cyan-500/15 border border-cyan-500/40 hover:bg-cyan-500/25 rounded-lg text-cyan-400 font-display font-bold tracking-widest text-sm transition-all active:scale-95">
                  CONFIRMAR
                </button>
                <button onClick={() => handleFire(null, null)}
                  className="px-4 py-2.5 bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] rounded-lg text-[#8b949e] font-mono text-sm transition-all">
                  Sin jugador
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => handleFire(null, null)}
                className="flex-1 py-2.5 bg-cyan-500/15 border border-cyan-500/40 hover:bg-cyan-500/25 rounded-lg text-cyan-400 font-display font-bold tracking-widest text-sm transition-all active:scale-95">
                MARCAR (sin jugador)
              </button>
              <p className="text-[#484f58] text-xs font-mono self-center">Agregá jugadores desde el panel</p>
            </div>
          )}
        </div>
      )}

      {/* ── Event buttons (only when idle) ────────────────────── */}
      {step === "idle" && (
        <div className="flex flex-col gap-3">
          {/* Doble nivel */}
          <div>
            <p className="text-[10px] font-mono text-[#484f58] tracking-widest mb-2 uppercase">Doble nivel</p>
            <div className="grid grid-cols-5 gap-1.5">
              {DOUBLE_CONFIGS.map(cfg => (
                <EventBtn key={cfg.tipo} cfg={cfg} disabled={disabled} flash={flash} onClick={handleClick} />
              ))}
            </div>
          </div>

          {/* Simples */}
          <div>
            <p className="text-[10px] font-mono text-[#484f58] tracking-widest mb-2 uppercase">Simples</p>
            <div className="grid grid-cols-5 gap-1.5">
              {SIMPLE_CONFIGS.map(cfg => (
                <EventBtn key={cfg.tipo} cfg={cfg} disabled={disabled} flash={flash} onClick={handleClick} />
              ))}
            </div>
          </div>

          {/* Binarios */}
          <div>
            <p className="text-[10px] font-mono text-[#484f58] tracking-widest mb-2 uppercase">Binarios</p>
            <div className="grid grid-cols-2 gap-1.5">
              {BINARY_CONFIGS.map(cfg => (
                <EventBtn key={cfg.tipo} cfg={cfg} disabled={disabled} flash={flash} onClick={handleClick} large />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventBtn({ cfg, disabled, flash, onClick, large }: {
  cfg: typeof EVENT_CONFIGS[0];
  disabled: boolean;
  flash: string | null;
  onClick: (tipo: EventTipo) => void;
  large?: boolean;
}) {
  const isFlashing = flash === cfg.tipo;
  return (
    <button
      disabled={disabled}
      onClick={() => onClick(cfg.tipo)}
      title={cfg.tipo}
      className={`flex flex-col items-center gap-1 ${large ? "py-4" : "p-2.5"} rounded-xl border font-display font-semibold transition-all duration-150 disabled:opacity-25 disabled:cursor-not-allowed active:scale-95 ${cfg.bgColor} ${cfg.borderColor} ${isFlashing ? `ring-2 ${cfg.ringColor} scale-95` : ""}`}
    >
      <span style={{ fontSize: large ? "1.8rem" : "1.3rem", lineHeight: 1 }}>{cfg.emoji}</span>
      <span className={`text-center leading-tight ${cfg.color}`} style={{ fontSize: "0.58rem", letterSpacing: "0.05em" }}>
        {cfg.shortLabel}
      </span>
    </button>
  );
}
