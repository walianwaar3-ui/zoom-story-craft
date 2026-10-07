/**
 * Gmail sync through Hermes. Hermes holds the Gmail credentials and runs the
 * mailbox; Wali OS is the record. Server only.
 *
 *   in:  POST /api/hermes/gmail/inbox   Hermes pushes Gmail messages (full bodies, Gmail ids)
 *   out: GET  /api/hermes/gmail/send    replies waiting in the outbox
 *        POST /api/hermes/gmail/send/:id/claim | sent | failed
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError, check } from "./server";

type Row = Record<string, unknown>;

export interface GmailMessageIn {
  gmail_message_id: string;
  gmail_thread_id: string;
  from_email: string;
  from_name: string;
  to: string[];
  subject: string;
  body: string;
  sent_at: string;
  direction: "in" | "out";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** "Name <a@b.com>" or "a@b.com" → "a@b.com" (lower case), else "". */
export function addressOf(v: unknown) {
  const s = String(v ?? "").trim();
  const e = (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
  return EMAIL.test(e) ? e : "";
}
/** Display name from "Name <a@b.com>"; a bare address has no name. */
const nameOf = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s.includes("<")) return EMAIL.test(s) ? "" : s.replace(/"/g, "");
  return s.replace(/<[^>]*>/, "").replace(/"/g, "").trim();
};

/** Subject without Re:/Fwd: prefixes, for matching threads Hermes created before Gmail ids existed. */
export function baseSubject(s: string) {
  let out = s.trim();
  while (/^(re|fw|fwd)\s*:\s*/i.test(out)) out = out.replace(/^(re|fw|fwd)\s*:\s*/i, "");
  return out.toLowerCase();
}

/** A stored body that is a cut-off version (Gmail snippet) of `full`. */
export function isSnippetOf(stored: string, full: string) {
  const clean = (x: string) => x.replace(/\s+/g, " ").replace(/(\.\.\.|…)\s*$/, "").trim();
  const a = clean(stored);
  const b = clean(full);
  return a.length > 0 && a.length < b.length && b.startsWith(a);
}

/** Validate Hermes's payload. Direction: given, else "out" when the sender is Wali's own address. */
export function parseMessages(body: unknown, ownEmails: string[]): GmailMessageIn[] {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || list.length === 0 || list.length > 100) throw new ApiError(400, '"messages" must be a list of 1-100 Gmail messages');
  const own = new Set(ownEmails.map((e) => e.toLowerCase()).filter(Boolean));
  return list.map((raw, i) => {
    const m = (raw ?? {}) as Row;
    const where = `messages[${i}]`;
    const id = String(m.gmail_message_id ?? "").trim();
    const thread = String(m.gmail_thread_id ?? "").trim();
    if (!id || !thread) throw new ApiError(400, `${where}: gmail_message_id and gmail_thread_id are required`);
    const from = addressOf(m.from_email ?? m.from);
    if (!from) throw new ApiError(400, `${where}: from_email must be an email address`);
    // Recipients other than Wali: for a thread Wali started, the first one is the contact.
    const to = (Array.isArray(m.to) ? m.to : String(m.to ?? "").split(",")).map(addressOf).filter((e) => e && !own.has(e));
    const at = new Date(String(m.sent_at ?? m.date ?? ""));
    if (Number.isNaN(at.getTime())) throw new ApiError(400, `${where}: sent_at must be an ISO date-time`);
    const text = String(m.body ?? "");
    if (!text.trim()) throw new ApiError(400, `${where}: body is required (the full plain-text body, not the snippet)`);
    const direction = m.direction === "in" || m.direction === "out" ? m.direction : own.has(from) ? "out" : "in";
    return {
      gmail_message_id: id,
      gmail_thread_id: thread,
      from_email: from,
      from_name: nameOf(m.from_name ?? m.from ?? m.from_email),
      to,
      subject: String(m.subject ?? ""),
      body: text.slice(0, 200_000),
      sent_at: at.toISOString(),
      direction,
    };
  });
}

/** Wali's own addresses: workspace owner email and GMAIL_ADDRESS. */
export async function ownEmails(db: SupabaseClient) {
  const s = check(await db.from("workspace_settings").select("owner_email").eq("id", 1).maybeSingle()) as Row | null;
  return [String(s?.owner_email ?? ""), process.env.GMAIL_ADDRESS ?? ""].map((e) => e.trim().toLowerCase()).filter(Boolean);
}

type Result = { gmail_thread_id: string; thread_id: string; client_id: string | null; created: boolean; new_messages: number; upgraded_snippets: number };

/**
 * Save Gmail messages. Idempotent: the same Gmail thread is one Wali OS thread,
 * the same Gmail message is stored once (a stored snippet is upgraded to the
 * full body). Threads Hermes logged before Gmail ids are adopted, and their
 * duplicates closed.
 */
export async function ingestGmail(db: SupabaseClient, messages: GmailMessageIn[]) {
  const byThread = new Map<string, GmailMessageIn[]>();
  for (const m of [...messages].sort((a, b) => a.sent_at.localeCompare(b.sent_at))) byThread.set(m.gmail_thread_id, [...(byThread.get(m.gmail_thread_id) ?? []), m]);

  const results: Result[] = [];
  for (const [gmailThreadId, msgs] of byThread) {
    const first = msgs[0];
    const contactMsg = msgs.find((m) => m.direction === "in") ?? first;
    const contactEmail = contactMsg.direction === "in" ? contactMsg.from_email : (contactMsg.to[0] ?? "");
    const contactName = contactMsg.direction === "in" ? contactMsg.from_name : "";
    if (!contactEmail) throw new ApiError(400, `Gmail thread ${gmailThreadId}: can't tell who the contact is (no inbound sender or recipient)`);

    let thread = check(await db.from("email_threads").select("*").eq("gmail_thread_id", gmailThreadId).maybeSingle()) as Row | null;
    let created = false;
    if (!thread) {
      // Adopt a thread Hermes logged before Gmail ids existed (same contact + subject); close its duplicates.
      const legacy = (check(
        await db.from("email_threads").select("*").is("gmail_thread_id", null).ilike("contact_email", contactEmail.replace(/[\\%_]/g, "\\$&")).order("updated_at")
      ) as Row[]).filter((t) => baseSubject(String(t.subject ?? "")) === baseSubject(first.subject));
      if (legacy.length) {
        thread = check(await db.from("email_threads").update({ gmail_thread_id: gmailThreadId }).eq("id", legacy[0].id).select().single()) as Row;
        const dupes = legacy.slice(1).map((t) => String(t.id));
        if (dupes.length) check(await db.from("email_threads").update({ status: "closed" }).in("id", dupes));
      } else {
        const ins = await db
          .from("email_threads")
          .insert({ gmail_thread_id: gmailThreadId, contact_email: contactEmail, contact_name: contactName, subject: first.subject, status: "needs-reply", updated_at: first.sent_at })
          .select()
          .single();
        if (ins.error && /duplicate key/i.test(ins.error.message)) {
          // Another Hermes loop created it a moment ago.
          thread = check(await db.from("email_threads").select("*").eq("gmail_thread_id", gmailThreadId).single()) as Row;
        } else {
          thread = check(ins) as Row;
          created = true;
        }
      }
    }
    const threadId = String(thread.id);

    const existing = check(await db.from("email_messages").select("id, body, direction, gmail_message_id").eq("thread_id", threadId)) as Row[];
    let newMessages = 0;
    let upgraded = 0;
    let lastNew: GmailMessageIn | null = null;
    for (const m of msgs) {
      const same = existing.find((e) => e.gmail_message_id === m.gmail_message_id);
      if (same) {
        if (String(same.body ?? "").length < m.body.length) check(await db.from("email_messages").update({ body: m.body }).eq("id", same.id));
        continue;
      }
      // A snippet stored earlier without a Gmail id: upgrade it in place.
      const snippet = existing.find((e) => !e.gmail_message_id && e.direction === m.direction && isSnippetOf(String(e.body ?? ""), m.body));
      if (snippet) {
        check(await db.from("email_messages").update({ body: m.body, gmail_message_id: m.gmail_message_id, from_email: m.from_email }).eq("id", snippet.id));
        snippet.gmail_message_id = m.gmail_message_id;
        upgraded++;
        continue;
      }
      const ins = await db
        .from("email_messages")
        .insert({ thread_id: threadId, direction: m.direction, body: m.body, at: m.sent_at, gmail_message_id: m.gmail_message_id, from_email: m.from_email });
      // Another Hermes loop may have inserted it a moment ago: that's fine.
      if (ins.error && !/duplicate key/i.test(ins.error.message)) throw new Error(`email_messages: ${ins.error.message}`);
      if (!ins.error) {
        newMessages++;
        lastNew = m;
      }
    }

    if (lastNew) {
      const status = String(thread.status);
      const holding = status === "awaiting-approval" || status === "ready-to-send";
      const nextStatus = lastNew.direction === "out" ? (holding ? status : "replied") : holding ? status : "needs-reply";
      const at = lastNew.sent_at > String(thread.updated_at ?? "") ? lastNew.sent_at : String(thread.updated_at);
      check(await db.from("email_threads").update({ status: nextStatus, updated_at: at }).eq("id", threadId));
      if (thread.client_id)
        check(await db.from("clients").update({ last_contact: lastNew.sent_at }).eq("id", thread.client_id).or(`last_contact.is.null,last_contact.lt."${lastNew.sent_at}"`));
    }
    const fresh = check(await db.from("email_threads").select("client_id").eq("id", threadId).single()) as Row;
    results.push({ gmail_thread_id: gmailThreadId, thread_id: threadId, client_id: (fresh.client_id as string) ?? null, created, new_messages: newMessages, upgraded_snippets: upgraded });
  }
  return results;
}

/** Claims older than this are considered abandoned (Hermes crashed mid-send) and can be retried. */
const STALE_MS = 10 * 60 * 1000;

/** Replies waiting to be sent, with what Gmail needs to thread them. */
export async function outboxQueue(db: SupabaseClient) {
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  const rows = check(
    await db
      .from("email_outbox")
      .select("*, thread:email_threads(id, gmail_thread_id, contact_name, subject, client_id)")
      .or(`status.eq.queued,and(status.eq.sending,claimed_at.lt."${stale}")`)
      .order("created_at")
      .limit(25)
  ) as (Row & { thread: Row | null })[];
  return Promise.all(
    rows.map(async ({ thread, ...o }) => {
      const last = check(
        await db.from("email_messages").select("gmail_message_id").eq("thread_id", o.thread_id).not("gmail_message_id", "is", null).order("at", { ascending: false }).limit(1)
      ) as Row[];
      return {
        ...o,
        gmail_thread_id: thread?.gmail_thread_id ?? null,
        // Reply in the same Gmail conversation: set In-Reply-To / References to this id.
        in_reply_to_gmail_message_id: last[0]?.gmail_message_id ?? null,
        client_id: thread?.client_id ?? null,
      };
    })
  );
}

/** Take a reply to send. Only one caller wins, so it's never sent twice. */
export async function claimOutbox(db: SupabaseClient, id: string) {
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  const row = check(
    await db
      .from("email_outbox")
      .update({ status: "sending", claimed_at: new Date().toISOString() })
      .eq("id", id)
      .or(`status.eq.queued,and(status.eq.sending,claimed_at.lt."${stale}")`)
      .select()
      .maybeSingle()
  );
  if (!row) throw new ApiError(409, "Not claimable: already claimed, sent, cancelled or not found. Don't send it.");
  return row;
}

/** Hermes sent it: record the message in the thread and close the loop. */
export async function markOutboxSent(db: SupabaseClient, id: string, body: Row) {
  const gmailId = String(body.gmail_message_id ?? "").trim();
  if (!gmailId) throw new ApiError(400, '"gmail_message_id" of the sent message is required');
  const o = check(await db.from("email_outbox").select("*").eq("id", id).maybeSingle()) as Row | null;
  if (!o) throw new ApiError(404, "Not found");
  if (o.status === "sent") return o;
  if (o.status !== "sending" && o.status !== "queued") throw new ApiError(409, `Outbox item is ${o.status}`);
  const at = body.sent_at && !Number.isNaN(new Date(String(body.sent_at)).getTime()) ? new Date(String(body.sent_at)).toISOString() : new Date().toISOString();

  const ins = await db.from("email_messages").insert({ thread_id: o.thread_id, direction: "out", body: o.body, at, gmail_message_id: gmailId, from_email: "" });
  if (ins.error && !/duplicate key/i.test(ins.error.message)) throw new Error(`email_messages: ${ins.error.message}`);

  const threadPatch: Row = { status: "replied", approval_id: null, updated_at: at };
  if (typeof body.gmail_thread_id === "string" && body.gmail_thread_id) threadPatch.gmail_thread_id = body.gmail_thread_id;
  const thread = check(await db.from("email_threads").update(threadPatch).eq("id", o.thread_id).is("gmail_thread_id", null).select("id").maybeSingle());
  if (!thread) {
    delete threadPatch.gmail_thread_id;
    check(await db.from("email_threads").update(threadPatch).eq("id", o.thread_id));
  }
  if (o.approval_id) check(await db.from("approvals").update({ executed_at: at }).eq("id", o.approval_id).is("executed_at", null));
  const t = check(await db.from("email_threads").select("client_id").eq("id", o.thread_id).single()) as Row;
  if (t.client_id) check(await db.from("clients").update({ last_contact: at }).eq("id", t.client_id));

  return check(await db.from("email_outbox").update({ status: "sent", sent_at: at, gmail_message_id: gmailId, error: "" }).eq("id", id).select().single());
}

export async function markOutboxFailed(db: SupabaseClient, id: string, body: Row) {
  const error = String(body.error ?? "").trim().slice(0, 1000) || "Hermes couldn't send it";
  const row = check(await db.from("email_outbox").update({ status: "failed", error }).eq("id", id).in("status", ["queued", "sending"]).select().maybeSingle());
  if (!row) throw new ApiError(409, "Only queued or sending replies can fail");
  return row;
}
