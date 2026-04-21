import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui;

// Returns null if env vars not configured (falls back to localStorage)
export const supabase = url && key ? createClient(url, key) : null;
