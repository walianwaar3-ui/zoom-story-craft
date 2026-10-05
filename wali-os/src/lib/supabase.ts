import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the deployment has Supabase configured; otherwise the app stores data in this browser. */
export const cloudEnabled = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!cloudEnabled) return null;
  client ??= createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
