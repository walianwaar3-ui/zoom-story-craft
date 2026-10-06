/**
 * Row <-> app model conversion. The database uses snake_case columns, nulls for
 * empty dates and timestamptz; the app uses camelCase, "" for empty dates and
 * ISO strings. Timestamps are normalised so a round trip is byte-identical,
 * which is what lets realtime echoes of our own writes be recognised.
 */
import type {
  Agent,
  Approval,
  Campaign,
  Client,
  ClientService,
  CollectionKey,
  EmailMessage,
  EmailThread,
  Settings,
  Task,
  TeamMember,
} from "@/lib/data/types";

type Row = Record<string, unknown>;

const ts = (v: unknown) => (v ? new Date(v as string).toISOString() : undefined);
const tsReq = (v: unknown) => ts(v) ?? new Date().toISOString();
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const dateOrNull = (v: string | undefined) => (v ? v : null);
const opt = <T,>(v: T | undefined | null) => (v === undefined || v === null || v === "" ? null : v);

export const TABLES: Record<CollectionKey, string> = {
  clients: "clients",
  services: "client_services",
  threads: "email_threads",
  campaigns: "campaigns",
  tasks: "tasks",
  approvals: "approvals",
  agents: "agents",
  team: "team_members",
};
export const MESSAGES_TABLE = "email_messages";
export const SETTINGS_TABLE = "workspace_settings";

/** Write order respects foreign keys: referenced rows first. */
export const WRITE_ORDER: CollectionKey[] = ["team", "agents", "clients", "services", "campaigns", "threads", "tasks", "approvals"];

export const settingsMapper = {
  from: (r: Row): Settings => ({
    businessName: str(r.business_name),
    ownerName: str(r.owner_name),
    ownerEmail: str(r.owner_email),
    currency: str(r.currency) || "USD",
    clocks: Array.isArray(r.clocks) ? (r.clocks as Settings["clocks"]) : [],
  }),
  to: (s: Settings): Row => ({
    id: 1,
    business_name: s.businessName,
    owner_name: s.ownerName,
    owner_email: s.ownerEmail,
    currency: s.currency,
    clocks: s.clocks,
  }),
};

export const messageMapper = {
  from: (r: Row): EmailMessage & { threadId: string } => ({
    id: str(r.id),
    threadId: str(r.thread_id),
    direction: r.direction === "out" ? "out" : "in",
    body: str(r.body),
    at: tsReq(r.at),
  }),
  to: (m: EmailMessage, threadId: string): Row => ({ id: m.id, thread_id: threadId, direction: m.direction, body: m.body, at: m.at }),
};

type Mapper<T> = { from: (r: Row) => T; to: (item: T) => Row };

const clientMapper: Mapper<Client> = {
  from: (r) => ({
    id: str(r.id),
    name: str(r.name),
    company: str(r.company),
    email: str(r.email),
    phone: str(r.phone),
    country: str(r.country),
    status: str(r.status) as Client["status"],
    health: str(r.health) as Client["health"],
    program: str(r.program),
    mrr: num(r.mrr),
    owner: str(r.owner),
    nextAction: str(r.next_action),
    notes: str(r.notes),
    tags: arr(r.tags),
    createdAt: tsReq(r.created_at),
    lastContact: ts(r.last_contact),
  }),
  to: (c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    country: c.country,
    status: c.status,
    health: c.health,
    program: c.program,
    mrr: c.mrr,
    owner: c.owner,
    next_action: c.nextAction,
    notes: c.notes,
    tags: c.tags,
    created_at: c.createdAt,
    last_contact: opt(c.lastContact),
  }),
};

const serviceMapper: Mapper<ClientService> = {
  from: (r) => ({
    id: str(r.id),
    clientId: str(r.client_id),
    name: str(r.name),
    kind: r.kind === "monthly" ? "monthly" : "one-time",
    status: str(r.status) as ClientService["status"],
    amount: num(r.amount),
    startDate: str(r.start_date),
    endDate: str(r.end_date),
    paidDate: str(r.paid_date),
    notes: str(r.notes),
    createdAt: tsReq(r.created_at),
  }),
  to: (s) => ({
    id: s.id,
    client_id: s.clientId,
    name: s.name,
    kind: s.kind,
    status: s.status,
    amount: s.amount,
    start_date: dateOrNull(s.startDate),
    end_date: dateOrNull(s.endDate),
    paid_date: dateOrNull(s.paidDate),
    notes: s.notes,
    created_at: s.createdAt,
  }),
};

/** Threads are stored without messages; messages live in their own table. */
const threadMapper: Mapper<EmailThread> = {
  from: (r) => ({
    id: str(r.id),
    contactName: str(r.contact_name),
    contactEmail: str(r.contact_email),
    subject: str(r.subject),
    clientId: (r.client_id as string) ?? undefined,
    status: str(r.status) as EmailThread["status"],
    messages: [],
    draft: str(r.draft),
    approvalId: (r.approval_id as string) ?? undefined,
    updatedAt: tsReq(r.updated_at),
  }),
  to: (t) => ({
    id: t.id,
    contact_name: t.contactName,
    contact_email: t.contactEmail,
    subject: t.subject,
    client_id: opt(t.clientId),
    status: t.status,
    draft: t.draft,
    approval_id: opt(t.approvalId),
    updated_at: t.updatedAt,
  }),
};

const campaignMapper: Mapper<Campaign> = {
  from: (r) => ({
    id: str(r.id),
    name: str(r.name),
    channel: str(r.channel) as Campaign["channel"],
    status: str(r.status) as Campaign["status"],
    objective: str(r.objective),
    market: str(r.market),
    budget: num(r.budget),
    spend: num(r.spend),
    leads: num(r.leads),
    booked: num(r.booked),
    revenue: num(r.revenue),
    startDate: str(r.start_date),
    endDate: str(r.end_date),
    notes: str(r.notes),
    createdAt: tsReq(r.created_at),
  }),
  to: (c) => ({
    id: c.id,
    name: c.name,
    channel: c.channel,
    status: c.status,
    objective: c.objective,
    market: c.market,
    budget: c.budget,
    spend: c.spend,
    leads: Math.round(c.leads),
    booked: Math.round(c.booked),
    revenue: c.revenue,
    start_date: dateOrNull(c.startDate),
    end_date: dateOrNull(c.endDate),
    notes: c.notes,
    created_at: c.createdAt,
  }),
};

const taskMapper: Mapper<Task> = {
  from: (r) => ({
    id: str(r.id),
    title: str(r.title),
    description: str(r.description),
    status: str(r.status) as Task["status"],
    priority: str(r.priority) as Task["priority"],
    assignee: str(r.assignee),
    clientId: (r.client_id as string) ?? undefined,
    due: str(r.due),
    tags: arr(r.tags),
    createdAt: tsReq(r.created_at),
  }),
  to: (t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee,
    client_id: opt(t.clientId),
    due: dateOrNull(t.due),
    tags: t.tags,
    created_at: t.createdAt,
  }),
};

const approvalMapper: Mapper<Approval> = {
  from: (r) => ({
    id: str(r.id),
    type: str(r.type) as Approval["type"],
    title: str(r.title),
    summary: str(r.summary),
    content: str(r.content),
    requestedBy: str(r.requested_by),
    clientId: (r.client_id as string) ?? undefined,
    threadId: (r.thread_id as string) ?? undefined,
    value: r.value == null ? undefined : Number(r.value),
    risk: str(r.risk) as Approval["risk"],
    status: str(r.status) as Approval["status"],
    createdAt: tsReq(r.created_at),
    decidedAt: ts(r.decided_at),
    decisionNote: (r.decision_note as string) ?? undefined,
    executedAt: ts(r.executed_at),
  }),
  to: (a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    summary: a.summary,
    content: a.content,
    requested_by: a.requestedBy,
    client_id: opt(a.clientId),
    thread_id: opt(a.threadId),
    value: a.value ?? null,
    risk: a.risk,
    status: a.status,
    created_at: a.createdAt,
    decided_at: opt(a.decidedAt),
    decision_note: opt(a.decisionNote),
    executed_at: opt(a.executedAt),
  }),
};

const agentMapper: Mapper<Agent> = {
  from: (r) => ({
    id: str(r.id),
    name: str(r.name),
    role: str(r.role),
    instructions: str(r.instructions),
    scopes: arr(r.scopes) as Agent["scopes"],
    status: str(r.status) as Agent["status"],
    requiresApproval: Boolean(r.requires_approval),
    avatarUrl: str(r.avatar_url),
    createdAt: tsReq(r.created_at),
  }),
  to: (a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    instructions: a.instructions,
    scopes: a.scopes,
    status: a.status,
    requires_approval: a.requiresApproval,
    avatar_url: a.avatarUrl ?? "",
    created_at: a.createdAt,
  }),
};

const teamMapper: Mapper<TeamMember> = {
  from: (r) => ({ id: str(r.id), name: str(r.name), email: str(r.email), role: str(r.role) }),
  to: (m) => ({ id: m.id, name: m.name, email: m.email, role: m.role }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous registry keyed by collection
export const MAPPERS: Record<CollectionKey, Mapper<any>> = {
  clients: clientMapper,
  services: serviceMapper,
  threads: threadMapper,
  campaigns: campaignMapper,
  tasks: taskMapper,
  approvals: approvalMapper,
  agents: agentMapper,
  team: teamMapper,
};

/** Normalise an item to exactly what a database round trip would return. */
export function canonical<K extends CollectionKey>(key: K, item: unknown) {
  return MAPPERS[key].from(MAPPERS[key].to(item));
}
