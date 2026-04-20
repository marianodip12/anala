import { createClient } from "@supabase/supabase-js";

const url = "https://xakmuljnclgywxdmgaws.supabase.co";
const key = "sb_publishable_ch8ZRoII6mX5CDBevsCcdQ_9w7NaknL";

export const supabase = createClient(url, key);
