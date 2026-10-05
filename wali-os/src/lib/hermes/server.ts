/**
 * Server-only helpers for the Hermes API (src/app/api/hermes). Never import
 * this from client components: it reads the Supabase service role key.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

/** Supabase client that bypasses Row Level Security. Server side only. */
export function adminDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

const bearer = (req: Request) => {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

/** True when the request carries `Authorization: Bearer <HERMES_API_KEY>`. */
export function authorized(req: Request): boolean {
  const expected = process.env.HERMES_API_KEY;
  if (!expected || expected.length < 32) return false;
  const token = bearer(req);
  // Compare fixed-length digests so the check takes the same time for any input.
  return token.length > 0 && timingSafeEqual(digest(token), digest(expected));
}

/**
 * True for Hermes (API key) or a signed-in Wali OS user (their Supabase access
 * token as the bearer). Use for routes the app UI and Hermes both call.
 */
export async function hermesOrUser(req: Request): Promise<boolean> {
  if (authorized(req)) return true;
  const token = bearer(req);
  const db = adminDb();
  if (!token || !db) return false;
  const { data, error } = await db.auth.getUser(token);
  return !error && Boolean(data.user);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Wraps a handler with the API key check, a configured database and uniform errors. */
export function handler<C>(fn: (db: SupabaseClient, req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    if (!authorized(req)) return json({ error: "Unauthorized" }, 401);
    const db = adminDb();
    if (!db) return json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL" }, 503);
    try {
      return await fn(db, req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      console.error("hermes api", e);
      return json({ error: "Internal error" }, 500);
    }
  };
}

/** Throws a 400 for database errors (constraint violations, bad values) instead of a 500. */
export function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new ApiError(res.error.code === "PGRST116" ? 404 : 400, res.error.message);
  return res.data;
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Body must be JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Body must be a JSON object");
  return body as Record<string, unknown>;
}

export function requireText(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== "string" || !v.trim()) throw new ApiError(400, `"${key}" is required`);
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireId(id: string): string {
  if (!UUID.test(id)) throw new ApiError(404, "Not found");
  return id;
}
