/**
 * What the Hermes API exposes, and what Hermes may change.
 *
 * Hermes never deletes, never decides approvals, and never changes an agent's
 * on/off status or its "requires approval" guardrail (those stay with you), nor
 * the workspace settings. Email status changes go through the action endpoints
 * so the approval rule can't be skipped.
 */
import { ApiError } from "./server";

export interface Resource {
  table: string;
  /** Columns Hermes may set on create. `null` = read only. */
  create: string[] | null;
  /** Columns Hermes may change on update. `null` = read only. */
  update: string[] | null;
  /** Query-string filters accepted on list (exact match). */
  filters: string[];
  order: string;
}

const CLIENT_COLS = [
  "name", "company", "email", "phone", "country", "status", "health", "program",
  "mrr", "owner", "next_action", "notes", "tags", "last_contact",
];
const TASK_COLS = ["title", "description", "status", "priority", "assignee", "client_id", "due", "tags"];
const CAMPAIGN_COLS = [
  "name", "channel", "status", "objective", "market", "budget", "spend", "leads",
  "booked", "revenue", "start_date", "end_date", "notes",
];

const SERVICE_COLS = ["client_id", "name", "kind", "status", "amount", "start_date", "end_date", "paid_date", "notes"];
const MEETING_COLS = ["client_id", "title", "occurred_at", "source", "url", "attendees", "summary", "decisions", "action_items", "risks", "transcript"];
/** Meeting list columns: everything but the transcript (ask with ?transcript=1). */
export const MEETING_LIST = "id, client_id, title, occurred_at, source, external_id, url, attendees, summary, decisions, action_items, risks, created_at";

const AGENT_COLS = ["name", "role", "instructions", "scopes", "avatar_url"];
export const AGENT_SCOPES = ["Email", "Clients", "Tasks", "Campaigns", "Approvals"];

export const RESOURCES: Record<string, Resource> = {
  clients: { table: "clients", create: CLIENT_COLS, update: CLIENT_COLS, filters: ["status", "health", "owner", "email"], order: "created_at" },
  tasks: { table: "tasks", create: TASK_COLS, update: TASK_COLS, filters: ["status", "priority", "assignee", "client_id"], order: "created_at" },
  campaigns: { table: "campaigns", create: CAMPAIGN_COLS, update: CAMPAIGN_COLS, filters: ["status", "channel", "market"], order: "created_at" },
  approvals: {
    table: "approvals",
    // Always created as "pending"; only you approve or reject (in Wali OS).
    create: ["type", "title", "summary", "content", "requested_by", "client_id", "thread_id", "value", "risk"],
    update: ["title", "summary", "content", "value", "risk"],
    filters: ["status", "type", "client_id", "thread_id", "requested_by"],
    order: "created_at",
  },
  // A client's projects and retainers (one-time or monthly).
  services: { table: "client_services", create: SERVICE_COLS, update: SERVICE_COLS, filters: ["client_id", "status", "kind"], order: "created_at" },
  // Meetings in a client's file. POST is an upsert by external_id and links the client by email (see client-file.ts).
  meetings: {
    table: "client_meetings",
    create: [...MEETING_COLS, "external_id", "client_email"],
    update: MEETING_COLS,
    filters: ["client_id", "source", "external_id"],
    order: "occurred_at",
  },
  threads: {
    table: "email_threads",
    create: ["contact_name", "contact_email", "subject", "client_id"],
    update: ["contact_name", "contact_email", "subject", "client_id", "draft"],
    filters: ["status", "client_id", "contact_email"],
    order: "updated_at",
  },
  agents: {
    table: "agents",
    // New agents start active with "requires approval" on (database defaults).
    create: AGENT_COLS,
    update: AGENT_COLS,
    filters: ["status", "name"],
    order: "created_at",
  },
  team: { table: "team_members", create: null, update: null, filters: [], order: "created_at" },
  // Runs Wali queued from the Agents page. Read here; move them with runs/:id/start|finish|fail.
  runs: { table: "agent_runs", create: null, update: null, filters: ["status", "agent_id"], order: "created_at" },
};

export function resource(name: string): Resource {
  const r = Object.hasOwn(RESOURCES, name) ? RESOURCES[name] : undefined;
  if (!r) throw new ApiError(404, `Unknown resource "${name}". Use one of: ${Object.keys(RESOURCES).join(", ")}`);
  return r;
}

/** Keep only allowed columns; reject anything else so typos don't fail silently. */
export function pick(body: Record<string, unknown>, allowed: string[] | null, verb: string): Record<string, unknown> {
  if (!allowed) throw new ApiError(403, `This resource is read only for Hermes (${verb})`);
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new ApiError(400, `Not allowed to set: ${unknown.join(", ")}. Allowed: ${allowed.join(", ")}`);
  if (!Object.keys(body).length) throw new ApiError(400, "Nothing to change");
  return body;
}

/** Extra checks for agent fields the database can't enforce. */
export function validateAgent(row: Record<string, unknown>) {
  if ("scopes" in row) {
    const s = row.scopes;
    if (!Array.isArray(s) || s.some((x) => !AGENT_SCOPES.includes(x as string)))
      throw new ApiError(400, `"scopes" must be a list drawn from: ${AGENT_SCOPES.join(", ")}`);
  }
  if ("avatar_url" in row) {
    const u = row.avatar_url;
    if (typeof u !== "string" || (u !== "" && !/^https:\/\/\S+$/.test(u)))
      throw new ApiError(400, '"avatar_url" must be an https:// URL (or use POST /api/hermes/agents/:id/avatar to upload a file)');
  }
}

/** Columns returned for a resource: threads include messages, runs include their agent. */
export function selectFor(name: string, opts: { transcript?: boolean } = {}) {
  if (name === "threads") return "*, messages:email_messages(*)";
  if (name === "meetings" && !opts.transcript) return MEETING_LIST;
  if (name === "runs") return "*, agent:agents(id, name, role, instructions, scopes, status, requires_approval)";
  return "*";
}
