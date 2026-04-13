"use client";

import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { SportEvent, EventTipo, EventResultado } from "@/types";

const STORAGE_KEY = "sports-analyzer-events";

export function useEvents() {
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SportEvent[];
        setEvents(parsed);
      }
    } catch {
      console.error("Error loading events from localStorage");
    }
    setLoaded(true);
  }, []);

  // Persist to localStorage whenever events change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {
      console.error("Error saving events to localStorage");
    }
  }, [events, loaded]);

  const addEvent = useCallback(
    (time: number, tipo: EventTipo, resultado: EventResultado = null) => {
      const newEvent: SportEvent = {
        id: uuidv4(),
        time,
        tipo,
        resultado,
        createdAt: Date.now(),
      };
      setEvents((prev) => {
        const updated = [...prev, newEvent];
        // Sort by time
        return updated.sort((a, b) => a.time - b.time);
      });
      return newEvent;
    },
    []
  );

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateResultado = useCallback(
    (id: string, resultado: EventResultado) => {
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, resultado } : e))
      );
    },
    []
  );

  const clearAll = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    events,
    addEvent,
    deleteEvent,
    updateResultado,
    clearAll,
    loaded,
  };
}
