/**
 * A client's file for Hermes and the agents: who they are, what they've bought,
 * what was said in meetings and the latest emails. Server only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { serviceTotals } from "@/lib/client-value";
import { cleanEmailBody } from "@/lib/email-clean";
import type { ClientService } from "@/lib/data/types";

import { ApiError, check } from "./server";

type Row = Record<string, unknown>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Escape LIKE wildcards so ilike works as a case-insensitive exact match.
const exact = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** The client a meeting belongs to: client_id, else client_email, else the first attendee who is a client. */
export async function resolveClientId(db: SupabaseClient, input: { client_id?: unknown; client_email?: unknown; attendees?: unknown }) {
  if (typeof input.client_id === "string" && input.client_id) {
    const found = check(await db.from("clients").select("id").eq("id", input.client_id).maybeSingle());
    if (!found) throw new ApiError(404, `No client with id ${input.client_id}`);
    return input.client_id;
  }
  const emails = [input.client_email, ...(Array.isArray(input.attendees) ? input.attendees : [])]
    .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
    // Attendees may be "Name <email>": take the address.
    .map((e) => e.match(/<([^>]+)>/)?.[1] ?? e)
    .filter((e) => EMAIL.test(e));
  for (const email of emails) {
    const rows = check(await db.from("clients").select("id").ilike("email", exact(email)).order("created_at").limit(1)) as Row[];
    if (rows[0]) return String(rows[0].id);
  }
  return null;
}

const MEETING_TEXT = ["title", "source", "external_id", "url", "summary", "decisions", "action_items", "risks", "transcript"] as const;

/**
 * Save a meeting from Hermes. With external_id (e.g. the Fathom recording id)
 * it's an upsert, so the 30-minute poll can re-send safely.
 */
export async function saveMeeting(db: SupabaseClient, body: Row) {
  const allowed = new Set<string>([...MEETING_TEXT, "client_id", "client_email", "occurred_at", "attendees"]);
  const unknown = Object.keys(body).filter((k) => !allowed.has(k));
  if (unknown.length) throw new ApiError(400, `Not allowed to set: ${unknown.join(", ")}. Allowed: ${[...allowed].join(", ")}`);

  const row: Row = {};
  for (const k of MEETING_TEXT) if (body[k] !== undefined) row[k] = String(body[k] ?? "");
  if (row.transcript !== undefined) row.transcript = String(row.transcript).slice(0, 500_000);
  if (body.attendees !== undefined) {
    if (!Array.isArray(body.attendees)) throw new ApiError(400, '"attendees" must be a list of names or emails');
    row.attendees = body.attendees.map(String).slice(0, 50);
  }
  if (body.occurred_at !== undefined) {
    const at = new Date(String(body.occurred_at));
    if (Number.isNaN(at.getTime())) throw new ApiError(400, '"occurred_at" must be an ISO date-time');
    row.occurred_at = at.toISOString();
  }
  if (!row.title && !row.summary && !row.transcript) throw new ApiError(400, "Send at least a title, summary or transcript");
  if (!row.source) row.source = "fathom";

  const clientId = await resolveClientId(db, body);
  row.client_id = clientId;

  const q = row.external_id ? db.from("client_meetings").upsert(row, { onConflict: "external_id" }) : db.from("client_meetings").insert(row);
  const saved = check(await q.select("id, client_id, title, occurred_at, source, external_id").single()) as Row;

  // The meeting counts as contact with the client.
  if (clientId) {
    const at = String(saved.occurred_at);
    check(await db.from("clients").update({ last_contact: at }).eq("id", clientId).or(`last_contact.is.null,last_contact.lt."${at}"`));
  }
  return {
    ...saved,
    linked: Boolean(clientId),
    note: clientId ? undefined : "Saved but not linked to a client: send client_id or client_email, or add the client's email in Wali OS. Link it later with PATCH /api/hermes/meetings/:id {client_id}.",
  };
}

const serviceFromRow = (r: Row): ClientService => ({
  id: String(r.id),
  clientId: String(r.client_id),
  name: String(r.name ?? ""),
  kind: r.kind === "monthly" ? "monthly" : "one-time",
  status: String(r.status) as ClientService["status"],
  amount: Number(r.amount ?? 0),
  startDate: String(r.start_date ?? ""),
  endDate: String(r.end_date ?? ""),
  paidDate: String(r.paid_date ?? ""),
  notes: String(r.notes ?? ""),
  createdAt: String(r.created_at ?? ""),
});

/**
 * Everything an agent needs before working on a client: the record, services
 * and lifetime value, recent meetings (summaries; the latest with its
 * transcript, trimmed), recent emails, open tasks and pending approvals.
 */
export async function clientFile(db: SupabaseClient, id: string, opts: { meetings?: number; transcriptChars?: number } = {}) {
  const meetingsN = Math.min(Math.max(opts.meetings ?? 5, 1), 20);
  const client = check(await db.from("clients").select("*").eq("id", id).maybeSingle()) as Row | null;
  if (!client) throw new ApiError(404, `No client with id ${id}`);

  const email = String(client.email ?? "");
  const threadQuery = db
    .from("email_threads")
    .select("id, subject, status, contact_email, updated_at, messages:email_messages(direction, body, at)")
    .order("updated_at", { ascending: false })
    .limit(5);
  const [services, meetings, latestTranscript, threads, tasks, approvals] = await Promise.all([
    db.from("client_services").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    db
      .from("client_meetings")
      .select("id, title, occurred_at, source, url, attendees, summary, decisions, action_items, risks")
      .eq("client_id", id)
      .order("occurred_at", { ascending: false })
      .limit(meetingsN),
    db.from("client_meetings").select("id, transcript").eq("client_id", id).order("occurred_at", { ascending: false }).limit(1),
    email ? threadQuery.or(`client_id.eq.${id},contact_email.ilike."${exact(email).replace(/"/g, "")}"`) : threadQuery.eq("client_id", id),
    db.from("tasks").select("id, title, status, priority, assignee, due").eq("client_id", id).neq("status", "done"),
    db.from("approvals").select("id, type, title, status, created_at").eq("client_id", id).eq("status", "pending"),
  ]);

  const serviceRows = (check(services) as Row[]).map(serviceFromRow);
  const totals = serviceTotals(serviceRows);
  const limit = opts.transcriptChars ?? 12_000;
  const latest = (check(latestTranscript) as Row[])[0];
  const transcript = String(latest?.transcript ?? "");

  return {
    client,
    value: {
      monthly: Number(client.mrr ?? 0),
      lifetime_paid: totals.paid,
      open: totals.open,
      proposed: totals.proposed,
      engagements: totals.engagements,
      returning: totals.engagements > 1,
    },
    services: serviceRows,
    meetings: check(meetings),
    latest_meeting_transcript: latest
      ? { meeting_id: latest.id, truncated: transcript.length > limit, text: transcript.length > limit ? `${transcript.slice(0, limit)}…` : transcript }
      : null,
    emails: (check(threads) as (Row & { messages: Row[] })[]).map(({ messages, ...t }) => ({
      ...t,
      // Latest 8 messages, oldest first, each trimmed.
      messages: [...messages]
        .sort((a, b) => String(a.at).localeCompare(String(b.at)))
        .slice(-8)
        // What was written in each message, without quoted history and signatures.
        .map((m) => ({ ...m, body: cleanEmailBody(String(m.body ?? "")).text.slice(0, 2000) })),
    })),
    tasks_open: check(tasks),
    approvals_pending: check(approvals),
  };
}

/** Clients named in a message (full name or company, 3+ characters), most specific first, at most `max`. */
export function mentionedClients(clients: { id: string; name: string; company: string }[], text: string, max = 2) {
  const t = text.toLowerCase();
  const hits = clients
    .map((c) => {
      const names = [c.name, c.company].map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 3);
      const hit = names.filter((n) => new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(t));
      return { id: c.id, score: Math.max(0, ...hit.map((n) => n.length)) };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
  return hits.slice(0, max).map((h) => h.id);
}
