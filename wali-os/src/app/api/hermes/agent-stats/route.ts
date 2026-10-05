/**
 * GET /api/hermes/agent-stats
 *
 * Per-agent performance for the Agents page bars (and for Hermes):
 *   { generated_at, stats: { [agentId]: { tasks: {todo, in_progress, review, done},
 *     approvals_pending, approvals_last_24h, last_active } } }
 *
 * An agent owns a task when `assignee` names it, and an approval when
 * `requested_by` names it, as a whole word, any case ("Operator", "operator",
 * "Hermes (Operator)"). `in_progress` counts tasks in progress or in review
 * (`review` is also given on its own). `last_active` is the latest change to
 * any of its tasks or approvals, or its newest approval request.
 *
 * Auth: the Hermes key, or a signed-in Wali OS user (the Agents page).
 */
import { check, handler, json } from "@/lib/hermes/server";

const DAY_MS = 24 * 60 * 60 * 1000;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** True when `text` contains `name` as a whole word, ignoring case. */
const names = (text: string | null | undefined, name: string) =>
  Boolean(text) && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name.trim())}($|[^\\p{L}\\p{N}])`, "iu").test(text!);

const later = (a: string | null, b: string | null | undefined) => (!b ? a : !a || b > a ? b : a);

export const GET = handler(
  async (db) => {
    const [agentsRes, tasksRes, approvalsRes] = await Promise.all([
      db.from("agents").select("id, name"),
      db.from("tasks").select("id, assignee, status"),
      db.from("approvals").select("id, requested_by, status, created_at"),
    ]);
    const agents = check(agentsRes) as { id: string; name: string }[];
    const tasks = check(tasksRes) as { id: string; assignee: string; status: string }[];
    const approvals = check(approvalsRes) as { id: string; requested_by: string; status: string; created_at: string }[];

    const cutoff = new Date(Date.now() - DAY_MS).toISOString();
    const owned = agents.map((agent) => ({
      agent,
      tasks: agent.name.trim() ? tasks.filter((t) => names(t.assignee, agent.name)) : [],
      approvals: agent.name.trim() ? approvals.filter((a) => names(a.requested_by, agent.name)) : [],
    }));

    // Latest change to each owned row, from the activity log (written by triggers).
    const rowIds = [...new Set(owned.flatMap((o) => [...o.tasks, ...o.approvals].map((r) => r.id)))];
    const lastChange = new Map<string, string>();
    if (rowIds.length) {
      const activity = check(
        await db.from("activity_log").select("row_id, at").in("row_id", rowIds).order("at", { ascending: false }).limit(5000)
      ) as { row_id: string; at: string }[];
      for (const a of activity) if (!lastChange.has(a.row_id)) lastChange.set(a.row_id, a.at);
    }

    const stats: Record<string, unknown> = {};
    for (const o of owned) {
      const count = (s: string) => o.tasks.filter((t) => t.status === s).length;
      const review = count("review");
      let lastActive: string | null = null;
      for (const r of [...o.tasks, ...o.approvals]) lastActive = later(lastActive, lastChange.get(r.id));
      for (const a of o.approvals) lastActive = later(lastActive, a.created_at);

      stats[o.agent.id] = {
        name: o.agent.name,
        tasks: { todo: count("todo"), in_progress: count("in-progress") + review, review, done: count("done") },
        approvals_pending: o.approvals.filter((a) => a.status === "pending").length,
        approvals_last_24h: o.approvals.filter((a) => a.created_at >= cutoff).length,
        last_active: lastActive ? new Date(lastActive).toISOString() : null,
      };
    }
    return json({ generated_at: new Date().toISOString(), stats });
  },
  { allowUser: true }
);
