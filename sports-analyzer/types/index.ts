// ─── EVENT CATEGORIES ────────────────────────────────────────────────────────

export type EventSubtype = "ofensivo" | "defensivo" | null;
export type EventResult  = "correcto" | "incorrecto" | null;
export type VideoMode    = "local" | "youtube" | null;

// A) Doble nivel: subtype + result
export type DoubleEventTipo =
  | "Tiro libre"
  | "Corner"
  | "Saque de arco"
  | "Tiro de larga distancia"
  | "Tiro de cerca";

// B) Simple: solo result
export type SimpleEventTipo =
  | "Lateral ofensivo"
  | "Pelota aérea"
  | "Saque del arquero"
  | "Pase ofensivo"
  | "Desmarque";

// C) Binario: sin opciones extra
export type BinaryEventTipo = "Gol" | "Gol rival";

// Legacy (backward compat)
export type LegacyEventTipo =
  | "Salida de Pelota"
  | "Perfil Corporal"
  | "Defensa"
  | "Transición Ofensiva"
  | "Transición Defensiva"
  | "Toma de Decisión"
  | "Tiro al Arco"
  | "Gambeta"
  | "Transición";                 // old name

export type EventTipo = DoubleEventTipo | SimpleEventTipo | BinaryEventTipo | LegacyEventTipo;

// Backward-compat alias (old field name)
export type EventResultado = EventResult;

// ─── SPORT EVENT ─────────────────────────────────────────────────────────────

export interface SportEvent {
  id: string;
  time: number;
  tipo: EventTipo;
  createdAt: number;

  // New fields (null for legacy events)
  subtype:     EventSubtype;
  result:      EventResult;
  player_id:   string | null;
  player_name: string | null;
  clip_start:  number;          // time - 5
  clip_end:    number;          // time

  // Multi-video: index into the VideoPlayer's files array (0 = first/only file)
  videoFileIndex?: number;

  // Legacy – keep for backward compat, map to result
  resultado?: EventResult;
}

// ─── PLAYER ──────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  number?: string;
}

// ─── SCORE / PARTIDO ─────────────────────────────────────────────────────────

export interface Score {
  local: number;
  visitante: number;
}

export interface Partido {
  id: string;
  nombre: string;
  equipoLocal: string;
  equipoVisitante: string;
  fecha: string;
  score: Score;
  events: SportEvent[];
  players: Player[];
  createdAt: number;
}

// ─── EVENT CONFIG ─────────────────────────────────────────────────────────────

export type EventCategory = "double" | "simple" | "binary" | "legacy";

export interface EventConfig {
  tipo: EventTipo;
  category: EventCategory;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
  shortLabel: string;
}

export const DOUBLE_EVENTS: DoubleEventTipo[] = [
  "Tiro libre", "Corner", "Saque de arco",
  "Tiro de larga distancia", "Tiro de cerca",
];

export const SIMPLE_EVENTS: SimpleEventTipo[] = [
  "Lateral ofensivo", "Pelota aérea", "Saque del arquero",
  "Pase ofensivo", "Desmarque",
];

export const BINARY_EVENTS: BinaryEventTipo[] = ["Gol", "Gol rival"];

export function getEventCategory(tipo: EventTipo): EventCategory {
  if ((DOUBLE_EVENTS as string[]).includes(tipo)) return "double";
  if ((SIMPLE_EVENTS as string[]).includes(tipo)) return "simple";
  if ((BINARY_EVENTS as string[]).includes(tipo)) return "binary";
  return "legacy";
}

export const EVENT_CONFIGS: EventConfig[] = [
  // ── Double ──
  { tipo: "Tiro libre",             category: "double", emoji: "🎯", color: "text-violet-400",  bgColor: "bg-violet-500/10 hover:bg-violet-500/20",  borderColor: "border-violet-500/40 hover:border-violet-400",  ringColor: "ring-violet-500",  shortLabel: "T. LIBRE"   },
  { tipo: "Corner",                  category: "double", emoji: "🚩", color: "text-orange-400",  bgColor: "bg-orange-500/10 hover:bg-orange-500/20",   borderColor: "border-orange-500/40 hover:border-orange-400",  ringColor: "ring-orange-500",  shortLabel: "CORNER"     },
  { tipo: "Saque de arco",           category: "double", emoji: "🧤", color: "text-sky-400",     bgColor: "bg-sky-500/10 hover:bg-sky-500/20",          borderColor: "border-sky-500/40 hover:border-sky-400",        ringColor: "ring-sky-500",     shortLabel: "S. ARCO"    },
  { tipo: "Tiro de larga distancia", category: "double", emoji: "💥", color: "text-rose-400",    bgColor: "bg-rose-500/10 hover:bg-rose-500/20",        borderColor: "border-rose-500/40 hover:border-rose-400",      ringColor: "ring-rose-500",    shortLabel: "LARGA"      },
  { tipo: "Tiro de cerca",           category: "double", emoji: "⚽", color: "text-emerald-400", bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",  borderColor: "border-emerald-500/40 hover:border-emerald-400",ringColor: "ring-emerald-500", shortLabel: "CERCA"      },
  // ── Simple ──
  { tipo: "Lateral ofensivo",        category: "simple", emoji: "↔️",  color: "text-cyan-400",   bgColor: "bg-cyan-500/10 hover:bg-cyan-500/20",         borderColor: "border-cyan-500/40 hover:border-cyan-400",      ringColor: "ring-cyan-500",    shortLabel: "LATERAL"    },
  { tipo: "Pelota aérea",            category: "simple", emoji: "🌀",  color: "text-indigo-400", bgColor: "bg-indigo-500/10 hover:bg-indigo-500/20",     borderColor: "border-indigo-500/40 hover:border-indigo-400",  ringColor: "ring-indigo-500",  shortLabel: "AÉREA"      },
  { tipo: "Saque del arquero",       category: "simple", emoji: "🧤",  color: "text-teal-400",   bgColor: "bg-teal-500/10 hover:bg-teal-500/20",         borderColor: "border-teal-500/40 hover:border-teal-400",      ringColor: "ring-teal-500",    shortLabel: "ARQ."       },
  { tipo: "Pase ofensivo",           category: "simple", emoji: "➡️",  color: "text-lime-400",   bgColor: "bg-lime-500/10 hover:bg-lime-500/20",         borderColor: "border-lime-500/40 hover:border-lime-400",      ringColor: "ring-lime-500",    shortLabel: "PASE"       },
  { tipo: "Desmarque",               category: "simple", emoji: "🏃",  color: "text-amber-400",  bgColor: "bg-amber-500/10 hover:bg-amber-500/20",       borderColor: "border-amber-500/40 hover:border-amber-400",    ringColor: "ring-amber-500",   shortLabel: "DESMARQ."   },
  // ── Binary ──
  { tipo: "Gol",                     category: "binary", emoji: "🥅",  color: "text-green-400",  bgColor: "bg-green-500/10 hover:bg-green-500/20",       borderColor: "border-green-500/40 hover:border-green-400",    ringColor: "ring-green-500",   shortLabel: "GOL"        },
  { tipo: "Gol rival",               category: "binary", emoji: "😤",  color: "text-red-400",    bgColor: "bg-red-500/10 hover:bg-red-500/20",           borderColor: "border-red-500/40 hover:border-red-400",        ringColor: "ring-red-500",     shortLabel: "GOL RIVAL"  },
  // ── Legacy (shown in list but not in buttons by default) ──
  { tipo: "Salida de Pelota",        category: "legacy", emoji: "🟢",  color: "text-emerald-400",bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",  borderColor: "border-emerald-500/40",                         ringColor: "ring-emerald-500", shortLabel: "SALIDA"     },
  { tipo: "Perfil Corporal",         category: "legacy", emoji: "🔵",  color: "text-sky-400",    bgColor: "bg-sky-500/10 hover:bg-sky-500/20",          borderColor: "border-sky-500/40",                             ringColor: "ring-sky-500",     shortLabel: "PERFIL"     },
  { tipo: "Defensa",                 category: "legacy", emoji: "🛡️",  color: "text-rose-400",   bgColor: "bg-rose-500/10 hover:bg-rose-500/20",        borderColor: "border-rose-500/40",                            ringColor: "ring-rose-500",    shortLabel: "DEFENSA"    },
  { tipo: "Transición Ofensiva",     category: "legacy", emoji: "⚡",  color: "text-amber-400",  bgColor: "bg-amber-500/10 hover:bg-amber-500/20",       borderColor: "border-amber-500/40",                           ringColor: "ring-amber-500",   shortLabel: "T.OFENS."   },
  { tipo: "Transición Defensiva",    category: "legacy", emoji: "🔄",  color: "text-orange-400", bgColor: "bg-orange-500/10 hover:bg-orange-500/20",     borderColor: "border-orange-500/40",                          ringColor: "ring-orange-500",  shortLabel: "T.DEFENS."  },
  { tipo: "Toma de Decisión",        category: "legacy", emoji: "🧠",  color: "text-violet-400", bgColor: "bg-violet-500/10 hover:bg-violet-500/20",     borderColor: "border-violet-500/40",                          ringColor: "ring-violet-500",  shortLabel: "DECISIÓN"   },
  { tipo: "Tiro al Arco",            category: "legacy", emoji: "🥅",  color: "text-pink-400",   bgColor: "bg-pink-500/10 hover:bg-pink-500/20",         borderColor: "border-pink-500/40",                            ringColor: "ring-pink-500",    shortLabel: "TIRO"       },
  { tipo: "Gambeta",                 category: "legacy", emoji: "🪄",  color: "text-cyan-400",   bgColor: "bg-cyan-500/10 hover:bg-cyan-500/20",         borderColor: "border-cyan-500/40",                            ringColor: "ring-cyan-500",    shortLabel: "GAMBETA"    },
  { tipo: "Transición",              category: "legacy", emoji: "🟡",  color: "text-amber-400",  bgColor: "bg-amber-500/10 hover:bg-amber-500/20",       borderColor: "border-amber-500/40",                           ringColor: "ring-amber-500",   shortLabel: "TRANS."     },
];

export function getEventConfig(tipo: EventTipo): EventConfig {
  return EVENT_CONFIGS.find(c => c.tipo === tipo) ?? EVENT_CONFIGS[0];
}

// ── Drawing / Annotation types (used by ClipDrawingEditor) ───────────────────
export type AnnotationTool = "pen" | "line" | "arrow" | "text";

export interface Annotation {
  id: string;
  tool: AnnotationTool;
  color: string;
  size: number;
  points: { x: number; y: number }[];
  text?: string;
  timeIn: number;    // video time when annotation appears (seconds)
  duration: number;  // how long it stays visible (0 = permanent)
}

// Migrate a legacy event to the new shape
export function migrateEvent(e: Partial<SportEvent> & { id: string; time: number; tipo: EventTipo; createdAt: number }): SportEvent {
  return {
    subtype:     null,
    result:      (e as { resultado?: EventResult }).resultado ?? e.result ?? null,
    player_id:   null,
    player_name: null,
    clip_start:  e.clip_start ?? Math.max(0, e.time - 5),
    clip_end:    e.clip_end   ?? e.time,
    ...e,
  } as SportEvent;
}
