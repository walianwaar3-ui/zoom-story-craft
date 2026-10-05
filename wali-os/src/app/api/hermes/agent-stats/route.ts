/**
 * GET /api/hermes/agent-stats
 *
 * Per-agent performance bars: what each agent has been doing,
 * what's pending, and when they were last active.
 */
import { handler, json } from "@/lib/hermes/server";

const HOURS_24 = 24 * 60 * 60 * 1000;

/** How many tasks each assignee has by status. */
async function tasksByAssignee(db: ReturnType<typeof import("@/lib/hermes/server").adminDb>) {
  if (!db) return {};
  const { data, error } = await db.from("tasks").select("assignee, status");
  if (error || !data) return {};

  const out: Record<string, Record<string, number>> = {};
  for (const t of data as { assignee?: string; status?: string }[]) {
    const a = (t.assignee || "unassigned").toLowerCase();
    const s = t.status || "todo";
    out[a] ??= {};
    out[a][s] = (out[a][s] || 0) + 1;
  }
  return out;
}

/** Count approvals created by each requestor (last 24h + total pending). */
async function approvalsByRequestor(db: ReturnType<typeof import("@/lib/hermes/server").adminDb>) {
  if (!db) return {};
  const cutoff = new Date(Date.now() - HOURS_24).toISOString();
  const { data, error } = await db.from("approvals").select("requested_by, status, created_at");
  if (error || !data) return {};

  const out: Record<string, { pending: number; last_24h: number }> = {};
  for (const a of data as { requested_by?: string; status?: string; created_at?: string }[]) {
    const r = (a.requested_by || "unknown").toLowerCase();
    out[r] ??= { pending: 0, last_24h: 0 };
    if (a.status === "pending") out[r].pending++;
    if (a.created_at && a.created_at >= cutoff) out[r].last_24h++;
  }
  return out;
}

/** Find the most recent timestamp an agent name or requestor appears in activity_log or agents. */
async function lastActive(db: ReturnType<typeof import("@/lib/hermes/server").adminDb>, agentNames: string[]) {
  if (!db) return {};
  const out: Record<string, string | null> = {};
  for (const name of agentNames) {
    const { data } = await db
      .from("activity_log")
      .select("at")
      .or(`label.ilike.%${name}%,actor.ilike.%${name}%`)
      .order("at", { ascending: false })
      .limit(1);
    out[name] = data?.[0]?.at ?? null;
  }
  return out;
}

export const GET = handler(async (db) => {
  const { data: agents, error } = await db.from("agents").select("id, name, role, status");
  if (error) return json({ error: error.message }, 500);

  const agentList = (agents ?? []) as { id: string; name: string; role: string; status: string }[];

  const [taskCounts, approvalCounts, lastSeen] = await Promise.all([
    tasksByAssignee(db),
    approvalsByRequestor(db),
    lastActive(db, agentList.map((a) => a.name)),
  ]);

  const stats: Record<string, unknown> = {};
  for (const agent of agentList) {
    const nameKey = agent.name.toLowerCase();
    const assigneeKey = agent.name === "Operator" ? "operator" : agent.name === "COO" ? "coo" : nameKey;
    const requestorKey = agent.name === "Meeting Analyser" ? "meeting analyser" : assigneeKey;

    const tasks = taskCounts[assigneeKey as keyof typeof taskCounts] || {};
    const approvals = approvalCounts[requestorKey] || { pending: 0, last_24h: 0 };

    stats[agent.id] = {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      tasks: {
        todo: tasks.todo || 0,
        in_progress: tasks.in_progress || 0,
        done: tasks.done || 0,
      },
      approvals_pending: approvals.pending || 0,
      approvals_last_24h: approvals.last_24h || 0,
      last_active: lastSeen[agent.name] || null,
    };
  }

  return json({ generated_at: new Date().toISOString(), stats });
});