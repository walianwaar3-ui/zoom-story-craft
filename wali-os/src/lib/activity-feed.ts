/**
 * The daily activity feed: one timeline of what happened across the business
 * (emails, tasks, meetings, client updates, approvals, ads), newest first.
 * Pure: the server gathers the rows (src/lib/hermes/activity.ts), this turns
 * them into entries. Safe for client and server code.
 */
import { emailPreview } from "@/lib/email-clean";

export type ActivityType =
  | "email_in"
  | "email_out"
  | "task_created"
  | "task_done"
  | "meeting"
  | "client_added"
  | "client_updated"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "approval_executed"
  | "ad_launched"
  | "campaign_created";

export interface ActivityEntry {
  /** Stable key: type plus the source row id. */
  id: string;
  type: ActivityType;
  title: string;
  client_id: string | null;
  client_name: string | null;
  at: string;
  detail: string;
  /** Where it lives in Wali OS. */
  link: string;
}

export const ACTIVITY_ICON: Record<ActivityType, string> = {
  email_in: "📥",
  email_out: "📤",
  task_created: "➕",
  task_done: "✓",
  meeting: "🔴",
  client_added: "👤",
  client_updated: "✏️",
  approval_requested: "🟡",
  approval_approved: "👍",
  approval_rejected: "✋",
  approval_executed: "⚡",
  ad_launched: "🚀",
  campaign_created: "📣",
};

type Row = Record<string, unknown>;

export interface ActivitySources {
  from: string;
  to: string;
  clients: Row[]; // id, name, next_action, health, status, created_at (every client the entries mention, plus new ones)
  messages: Row[]; // id, direction, body, at, gmail_message_id, thread: {id, subject, contact_name, contact_email, client_id}
  outboxSent: Row[]; // id, thread_id, to_email, subject, sent_at, gmail_message_id, client_id, contact_name
  tasksCreated: Row[]; // id, title, assignee, client_id, created_at
  tasksDone: { task: Row; at: string }[]; // tasks now done, with when their status last changed
  meetings: Row[]; // id, client_id, title, occurred_at, created_at, action_items, attendees
  clientUpdates: { id: number; row_id: string; at: string; changed: string[] }[];
  approvals: Row[]; // id, type, title, status, requested_by, client_id, created_at, decided_at, executed_at
  campaigns: Row[]; // id, name, channel, status, created_at
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const inWindow = (at: unknown, s: ActivitySources) => {
  const t = str(at);
  return Boolean(t) && t >= s.from && t <= s.to;
};
/** ISO timestamps from Postgres ("2026-10-08 14:05:34+00") and JS compare correctly once normalised. */
export const iso = (v: unknown) => {
  const t = str(v);
  if (!t) return "";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Lines that look like action items: bullets, numbers or checkboxes; else non-empty lines. */
export function countActionItems(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^([-*•]|\d+[.)]|\[[ xX]?\])\s*/.test(l));
  return bullets.length || lines.length;
}

const FIELD_LABEL: Record<string, string> = {
  next_action: "next action",
  last_contact: "last contact",
  health: "health",
  status: "status",
  mrr: "monthly revenue",
  notes: "notes",
  program: "program",
  email: "email",
  company: "company",
  phone: "phone",
  owner: "owner",
  tags: "tags",
  name: "name",
  country: "country",
};
const QUIET_FIELDS = new Set(["last_contact"]);

/** Turn the gathered rows into the feed, newest first. */
export function buildActivityFeed(s: ActivitySources): ActivityEntry[] {
  const clients = new Map(s.clients.map((c) => [str(c.id), c]));
  const clientName = (id: unknown) => (id ? str(clients.get(str(id))?.name) || null : null);
  const out: ActivityEntry[] = [];
  const push = (e: Omit<ActivityEntry, "client_name" | "at"> & { at: unknown }) => {
    const at = iso(e.at);
    if (!at || !inWindow(at, s)) return;
    out.push({ ...e, at, client_name: clientName(e.client_id), client_id: e.client_id ? str(e.client_id) : null });
  };

  // Emails, as synced from Gmail. Replies Hermes just sent show from the outbox until Gmail catches up.
  const syncedIds = new Set(s.messages.map((m) => str(m.gmail_message_id)).filter(Boolean));
  for (const m of s.messages) {
    const t = (m.thread ?? {}) as Row;
    const who = clientName(t.client_id) ?? (str(t.contact_name) || str(t.contact_email) || "someone");
    const subject = str(t.subject) || "(no subject)";
    const incoming = m.direction === "in";
    push({
      id: `email:${str(m.id)}`,
      type: incoming ? "email_in" : "email_out",
      title: incoming ? `${who}: "${emailPreview(str(m.body), 70) || subject}"` : `Replied to ${who} — ${subject}`,
      detail: incoming ? subject : emailPreview(str(m.body), 90),
      client_id: str(t.client_id) || null,
      at: m.at,
      link: `/inbox?t=${str(t.id)}`,
    });
  }
  for (const o of s.outboxSent) {
    if (o.gmail_message_id && syncedIds.has(str(o.gmail_message_id))) continue;
    const who = clientName(o.client_id) ?? (str(o.contact_name) || str(o.to_email));
    push({
      id: `outbox:${str(o.id)}`,
      type: "email_out",
      title: `Replied to ${who} — ${str(o.subject) || "(no subject)"}`,
      detail: "Sent through Gmail by Hermes",
      client_id: str(o.client_id) || null,
      at: o.sent_at,
      link: `/inbox?t=${str(o.thread_id)}`,
    });
  }

  for (const t of s.tasksCreated) {
    push({
      id: `task:${str(t.id)}`,
      type: "task_created",
      title: `New task: ${str(t.title)}`,
      detail: str(t.assignee) ? `for ${str(t.assignee)}` : "",
      client_id: str(t.client_id) || null,
      at: t.created_at,
      link: "/tasks",
    });
  }
  for (const { task, at } of s.tasksDone) {
    push({
      id: `done:${str(task.id)}`,
      type: "task_done",
      title: `Task done: ${str(task.title)}`,
      detail: str(task.assignee) ? `by ${str(task.assignee)}` : "",
      client_id: str(task.client_id) || null,
      at,
      link: "/tasks",
    });
  }

  for (const m of s.meetings) {
    const items = countActionItems(str(m.action_items));
    const met = iso(m.occurred_at);
    const sameDay = met && iso(m.created_at).slice(0, 10) === met.slice(0, 10);
    const who = clientName(m.client_id) ?? (str(m.title) || "Meeting");
    push({
      id: `meeting:${str(m.id)}`,
      type: "meeting",
      title: `Meeting: ${who}${items ? ` — ${items} action item${items === 1 ? "" : "s"}` : ""}`,
      // When the recording lands days after the call, say when it happened.
      detail: [m.client_id && str(m.title), met && !sameDay ? `met ${new Date(met).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""]
        .filter(Boolean)
        .join(" · "),
      client_id: str(m.client_id) || null,
      at: m.created_at,
      link: m.client_id ? `/clients?client=${str(m.client_id)}` : "/clients",
    });
  }

  for (const c of s.clients) {
    if (!inWindow(iso(c.created_at), s)) continue;
    push({
      id: `client:${str(c.id)}`,
      type: "client_added",
      title: `New ${c.status === "lead" ? "lead" : "client"}: ${str(c.name)}`,
      detail: str(c.next_action),
      client_id: str(c.id),
      at: c.created_at,
      link: `/clients?client=${str(c.id)}`,
    });
  }

  // Client edits: one line per client per day (Hermes re-saves next_action often), latest time wins.
  // A last-contact bump alone is skipped when an email or meeting that day already shows the contact.
  const contactDays = new Set(out.filter((e) => e.client_id && ["email_in", "email_out", "meeting"].includes(e.type)).map((e) => `${e.client_id}|${e.at.slice(0, 10)}`));
  const groups = new Map<string, { row_id: string; at: string; fields: Set<string> }>();
  for (const u of s.clientUpdates) {
    const at = iso(u.at);
    if (!at) continue;
    const key = `${u.row_id}|${at.slice(0, 10)}`;
    const g = groups.get(key) ?? { row_id: u.row_id, at, fields: new Set<string>() };
    if (at > g.at) g.at = at;
    for (const f of u.changed ?? []) if (FIELD_LABEL[f]) g.fields.add(f);
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const fields = [...g.fields];
    if (fields.length === 0) continue;
    const quiet = fields.every((f) => QUIET_FIELDS.has(f));
    if (quiet && contactDays.has(key)) continue;
    const c = clients.get(g.row_id);
    if (!c) continue;
    const next = str(c.next_action);
    push({
      id: `client-update:${key}`,
      type: "client_updated",
      title: quiet
        ? `Contact logged with ${str(c.name)}`
        : `Updated ${str(c.name)}${g.fields.has("next_action") && next ? ` — ${clip(next, 80)}` : ""}`,
      detail: quiet ? "" : fields.map((f) => (f === "health" ? `health → ${str(c.health)}` : FIELD_LABEL[f])).join(", "),
      client_id: g.row_id,
      at: g.at,
      link: `/clients?client=${g.row_id}`,
    });
  }

  for (const a of s.approvals) {
    const id = str(a.id);
    const title = str(a.title);
    const ad = a.type === "Campaign";
    const link = `/approvals?id=${id}`;
    push({
      id: `approval:${id}`,
      type: "approval_requested",
      title: `Approval requested: ${title}`,
      detail: str(a.requested_by) ? `from ${str(a.requested_by)}` : str(a.type),
      client_id: str(a.client_id) || null,
      at: a.created_at,
      link,
    });
    if (a.decided_at && (a.status === "approved" || a.status === "rejected")) {
      push({
        id: `decided:${id}`,
        type: a.status === "approved" ? "approval_approved" : "approval_rejected",
        title: `${a.status === "approved" ? "Approved" : "Rejected"}: ${title}`,
        detail: a.status === "approved" && !a.executed_at ? `waiting on ${str(a.requested_by) || "the agent"} to carry it out` : "",
        client_id: str(a.client_id) || null,
        at: a.decided_at,
        link,
      });
    }
    if (a.executed_at) {
      push({
        id: `executed:${id}`,
        type: ad ? "ad_launched" : "approval_executed",
        title: ad ? `Pushed to Meta: ${title.replace(/^Launch ad:\s*/i, "")}` : `Done: ${title}`,
        detail: str(a.requested_by) ? `by ${str(a.requested_by)}` : "",
        client_id: str(a.client_id) || null,
        at: a.executed_at,
        link,
      });
    }
  }

  for (const c of s.campaigns) {
    push({
      id: `campaign:${str(c.id)}`,
      type: "campaign_created",
      title: `Campaign created: ${str(c.name)}`,
      detail: [str(c.channel), str(c.status)].filter(Boolean).join(" · "),
      client_id: null,
      at: c.created_at,
      link: "/campaigns",
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
