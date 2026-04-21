import { createClient } from "@supabase/supabase-js";

const url = "https://xakmuljnclgywxdmgaws.supabase.co";
const key = "sb_publishable_ch8ZRoII6mX5CDBevsCcdQ_9w7NaknL";

// Returns null if env vars not configured (falls back to localStorage)
export const supabase = url && key ? createClient(url, key) : null;
