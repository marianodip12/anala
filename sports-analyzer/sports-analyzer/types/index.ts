export type EventTipo =
  | "Salida de Pelota"
  | "Perfil Corporal"
  | "Defensa"
  | "Transición"
  | "Toma de Decisión";

export type EventResultado = "correcto" | "incorrecto" | null;

export type VideoMode = "local" | "youtube" | null;

export interface SportEvent {
  id: string;
  time: number;
  tipo: EventTipo;
  resultado: EventResultado;
  createdAt: number;
}

export interface EventConfig {
  tipo: EventTipo;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
  label: string;
}

export const EVENT_CONFIGS: EventConfig[] = [
  {
    tipo: "Salida de Pelota",
    emoji: "🟢",
    color: "text-green-400",
    bgColor: "bg-green-500/10 hover:bg-green-500/20",
    borderColor: "border-green-500/40 hover:border-green-400",
    ringColor: "ring-green-500",
    label: "Salida de Pelota",
  },
  {
    tipo: "Perfil Corporal",
    emoji: "🔵",
    color: "text-sky-400",
    bgColor: "bg-sky-500/10 hover:bg-sky-500/20",
    borderColor: "border-sky-500/40 hover:border-sky-400",
    ringColor: "ring-sky-500",
    label: "Perfil Corporal",
  },
  {
    tipo: "Defensa",
    emoji: "🔴",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
    borderColor: "border-rose-500/40 hover:border-rose-400",
    ringColor: "ring-rose-500",
    label: "Defensa",
  },
  {
    tipo: "Transición",
    emoji: "🟡",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
    borderColor: "border-amber-500/40 hover:border-amber-400",
    ringColor: "ring-amber-500",
    label: "Transición",
  },
  {
    tipo: "Toma de Decisión",
    emoji: "⚪",
    color: "text-slate-300",
    bgColor: "bg-slate-500/10 hover:bg-slate-500/20",
    borderColor: "border-slate-400/40 hover:border-slate-300",
    ringColor: "ring-slate-400",
    label: "Toma de Decisión",
  },
];
