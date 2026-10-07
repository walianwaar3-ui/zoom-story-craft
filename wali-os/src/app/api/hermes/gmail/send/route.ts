/**
 * GET /api/hermes/gmail/send — replies Wali queued (or approved) for Hermes to send from Gmail.
 * For each: POST /api/hermes/gmail/send/:id/claim, send, then /sent {gmail_message_id} or /failed {error}.
 */
import { outboxQueue } from "@/lib/hermes/gmail";
import { handler, json } from "@/lib/hermes/server";

export const GET = handler(async (db) => json({ data: await outboxQueue(db) }));
