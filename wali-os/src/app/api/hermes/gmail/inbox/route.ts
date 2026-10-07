/**
 * Gmail inbox through Hermes.
 *   POST {messages: [...]}  Hermes pushes Gmail messages (full bodies, Gmail ids). Safe to re-send.
 *   GET  ?client_id=&limit= threads with their full messages, newest first.
 */
import { ingestGmail, ownEmails, parseMessages } from "@/lib/hermes/gmail";
import { check, handler, json, readBody } from "@/lib/hermes/server";

export const POST = handler(async (db, req) => {
  const messages = parseMessages(await readBody(req), await ownEmails(db));
  const threads = await ingestGmail(db, messages);
  return json({ data: { threads, new_messages: threads.reduce((n, t) => n + t.new_messages, 0) } });
});

export const GET = handler(async (db, req) => {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  let q = db.from("email_threads").select("*, messages:email_messages(id, direction, body, at, gmail_message_id, from_email)");
  const client = url.searchParams.get("client_id");
  if (client) q = q.eq("client_id", client);
  const rows = check(await q.order("updated_at", { ascending: false }).limit(limit)) as { messages: { at: string }[] }[];
  return json({ data: rows.map((t) => ({ ...t, messages: [...t.messages].sort((a, b) => a.at.localeCompare(b.at)) })) });
});
