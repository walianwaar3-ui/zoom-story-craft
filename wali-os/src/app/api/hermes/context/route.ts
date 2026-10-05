import { buildContext } from "@/lib/hermes/context";
import { handler, json } from "@/lib/hermes/server";

/**
 * GET /api/hermes/context — one call that tells Hermes what's going on right now:
 * what needs a decision, what needs a reply, what's due, who's at risk, what's live.
 */
export const GET = handler(async (db) => json(await buildContext(db)));
