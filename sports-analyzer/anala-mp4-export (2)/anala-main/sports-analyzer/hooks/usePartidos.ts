"use client";
import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  Partido, SportEvent, EventTipo, EventSubtype, EventResult,
  Player, Score
} from "@/types";
import { migrateEvent } from "@/types";

const STORAGE_KEY = "sporttag-partidos-v3";

function migratePartido(raw: Record<string, unknown>): Partido {
  const p = raw as Partial<Partido>;
  return {
    id: p.id ?? uuidv4(),
    nombre: p.nombre ?? "",
    equipoLocal: p.equipoLocal ?? "",
    equipoVisitante: p.equipoVisitante ?? "",
    fecha: p.fecha ?? "",
    score: p.score ?? { local: 0, visitante: 0 },
    players: p.players ?? [],
    events: (p.events ?? []).map(e => migrateEvent(e as SportEvent)),
    createdAt: p.createdAt ?? Date.now(),
  };
}

export function usePartidos() {
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
        ?? localStorage.getItem("sporttag-partidos-v2");
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>[];
        setPartidos(parsed.map(migratePartido));
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(partidos)); } catch {}
  }, [partidos, loaded]);

  const crearPartido = useCallback((
    nombre: string, equipoLocal: string, equipoVisitante: string, fecha: string
  ): Partido => {
    const p: Partido = {
      id: uuidv4(), nombre, equipoLocal, equipoVisitante, fecha,
      score: { local: 0, visitante: 0 }, events: [], players: [], createdAt: Date.now(),
    };
    setPartidos(prev => [p, ...prev]);
    return p;
  }, []);

  const borrarPartido = useCallback((id: string) =>
    setPartidos(prev => prev.filter(p => p.id !== id)), []);

  const updateScore = useCallback((id: string, score: Score) =>
    setPartidos(prev => prev.map(p => p.id === id ? { ...p, score } : p)), []);

  const addPlayer = useCallback((partidoId: string, name: string, number?: string): Player => {
    const player: Player = { id: uuidv4(), name, number };
    setPartidos(prev => prev.map(p =>
      p.id !== partidoId ? p : { ...p, players: [...p.players, player] }
    ));
    return player;
  }, []);

  const removePlayer = useCallback((partidoId: string, playerId: string) =>
    setPartidos(prev => prev.map(p =>
      p.id !== partidoId ? p : { ...p, players: p.players.filter(pl => pl.id !== playerId) }
    )), []);

  const addEvent = useCallback((
    partidoId: string,
    time: number,
    tipo: EventTipo,
    subtype: EventSubtype = null,
    result: EventResult = null,
    playerId: string | null = null,
    playerName: string | null = null,
  ): SportEvent => {
    const event: SportEvent = {
      id: uuidv4(), time, tipo, createdAt: Date.now(),
      subtype, result, player_id: playerId, player_name: playerName,
      clip_start: Math.max(0, time - 5), clip_end: time,
    };
    setPartidos(prev => prev.map(p => {
      if (p.id !== partidoId) return p;
      const events = [...p.events, event].sort((a, b) => a.time - b.time);
      let score = p.score;
      if (tipo === "Gol")       score = { ...score, local:     score.local + 1 };
      if (tipo === "Gol rival") score = { ...score, visitante: score.visitante + 1 };
      return { ...p, events, score };
    }));
    return event;
  }, []);

  const deleteEvent = useCallback((partidoId: string, eventId: string) =>
    setPartidos(prev => prev.map(p =>
      p.id !== partidoId ? p : { ...p, events: p.events.filter(e => e.id !== eventId) }
    )), []);

  const updateEventResult = useCallback((
    partidoId: string, eventId: string, result: EventResult
  ) => setPartidos(prev => prev.map(p =>
    p.id !== partidoId ? p : {
      ...p, events: p.events.map(e =>
        e.id === eventId ? { ...e, result, resultado: result } : e
      )
    }
  )), []);

  const updateClip = useCallback((
    partidoId: string, eventId: string, clip_start: number, clip_end: number
  ) => setPartidos(prev => prev.map(p =>
    p.id !== partidoId ? p : {
      ...p, events: p.events.map(e =>
        e.id === eventId ? { ...e, clip_start, clip_end } : e
      )
    }
  )), []);

  const clearEvents = useCallback((partidoId: string) =>
    setPartidos(prev => prev.map(p =>
      p.id !== partidoId ? p : { ...p, events: [] }
    )), []);

  return {
    partidos, loaded,
    crearPartido, borrarPartido, updateScore,
    addPlayer, removePlayer,
    addEvent, deleteEvent, updateEventResult, updateClip, clearEvents,
  };
}
