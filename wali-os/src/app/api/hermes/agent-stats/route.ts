/**
 * GET /api/hermes/agent-stats
 *
 * Per-agent performance bars: tasks assigned, approvals created,
 * and when each agent was last active.
 */
import { handler, json } from "@/lib/hermes/server";

const HOURS_24 = 24 * 60 * 60 * 1000;

export const GET = handler(async (db) => {
  const { data: agents, error } = await db.from("agents").select("id, name, role, status");
  if (error) return json({ error: error.message }, 500);

  const agentList = (agents ?? []) as { id: string; name: string; role: string; status: string }[];

  // Fetch all relevant data in parallel
  const [{ data: tasks }, { data: approvals }, { data: activity }] = await Promise.all([
    db.from("tasks").select("assignee, status"),
    db.from("approvals").select("requested_by, status, created_at"),
    db.from("activity_log").select("label, at").order("at", { ascending: false }).limit(500),
  ]);

  const taskRows = (tasks ?? []) as { assignee?: string; status?: string }[];
  const approvalRows = (approvals ?? []) as { requested_by?: string; status?: string; created_at?: string }[];
  const activityRows = (activity ?? []) as { label?: string; at?: string }[];

  const cutoff = new Date(Date.now() - HOURS_24).toISOString();

  const stats: Record<string, unknown> = {};

  for (const agent of agentList) {
    const name = agent.name.toLowerCase();

    // Tasks: count by assignee matching agent name
    const agentTasks = { todo: 0, in_progress: 0, done: 0 };
    for (const t of taskRows) {
      const a = (t.assignee || "").toLowerCase();
      if (a && name.includes(a) || a.includes(name)) {
        const s = t.status || "todo";
        if (s in agentTasks) agentTasks[s as keyof typeof agentTasks]++;
      }
    }

    // Approvals: count by requested_by containing agent name
    let pending = 0;
    let last24h = 0;
    for (const a of approvalRows) {
      const r = (a.requested_by || "").toLowerCase();
      if (r.includes(name)) {
        if (a.status === "pending") pending++;
        if (a.created_at && a.created_at >= cutoff) last24h++;
      }
    }

    // Last active: most recent activity_log entry mentioning this agent
    let lastActive: string | null = null;
    for (const a of activityRows) {
      const label = (a.label || "").toLowerCase();
      if (label.includes(name) && a.at) {
        lastActive = a.at;
        break; // already sorted desc
      }
    }

    stats[agent.id] = {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      tasks: agentTasks,
      approvals_pending: pending,
      approvals_last_24h: last24h,
      last_active: lastActive,
    };
  }

  return json({ generated_at: new Date().toISOString(), stats });
});