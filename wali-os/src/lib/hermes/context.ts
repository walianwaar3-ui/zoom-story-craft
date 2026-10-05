import type { SupabaseClient } from "@supabase/supabase-js";

import { check } from "./server";

type Row = Record<string, unknown>;

/**
 * Snapshot of what's going on right now: what needs a decision, what needs a
 * reply, what's due, who's at risk, what's live. Used by /api/hermes/context
 * and as live context for agent chat.
 */
export async function buildContext(db: SupabaseClient) {
  const [settings, clients, tasks, campaigns, approvals, threads, agents, team, activity] = await Promise.all([
    db.from("workspace_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("clients").select("id, name, company, email, status, health, program, mrr, owner, next_action, last_contact"),
    db.from("tasks").select("*").neq("status", "done").order("due", { ascending: true, nullsFirst: false }),
    db.from("campaigns").select("*").in("status", ["live", "planned"]),
    db.from("approvals").select("*").or("status.eq.pending,and(status.eq.approved,executed_at.is.null)").order("created_at"),
    db
      .from("email_threads")
      .select("*, messages:email_messages(direction, body, at)")
      .in("status", ["needs-reply", "awaiting-approval", "ready-to-send"])
      .order("updated_at", { ascending: false }),
    db.from("agents").select("id, name, role, instructions, scopes, status, requires_approval, avatar_url"),
    db.from("team_members").select("name, email, role"),
    db.from("activity_log").select("*").order("id", { ascending: false }).limit(25),
  ]);

  const allClients = check(clients) as Row[];
  const openTasks = check(tasks) as Row[];
  const today = new Date().toISOString().slice(0, 10);
  const approvalRows = check(approvals) as Row[];
  const threadRows = (check(threads) as (Row & { messages: Row[] })[]).map(({ messages, ...t }): Row => {
    const sorted = [...messages].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return { ...t, message_count: sorted.length, last_message: sorted.at(-1) ?? null };
  });
  const active = allClients.filter((c) => c.status === "active");

  return {
    generated_at: new Date().toISOString(),
    workspace: check(settings),
    summary: {
      clients_total: allClients.length,
      clients_active: active.length,
      mrr: active.reduce((sum, c) => sum + Number(c.mrr ?? 0), 0),
      approvals_pending: approvalRows.filter((a) => a.status === "pending").length,
      approvals_to_carry_out: approvalRows.filter((a) => a.status === "approved").length,
      emails_needing_reply: threadRows.filter((t) => t.status === "needs-reply").length,
      tasks_open: openTasks.length,
      tasks_overdue: openTasks.filter((t) => t.due && String(t.due) < today).length,
    },
    // Waiting on you. Hermes must not act on these until they're approved.
    approvals_pending: approvalRows.filter((a) => a.status === "pending"),
    // Approved by you and not yet carried out: Hermes's to-do list.
    approvals_to_carry_out: approvalRows.filter((a) => a.status === "approved"),
    email_threads_open: threadRows,
    tasks_open: openTasks.map((t) => ({ ...t, overdue: Boolean(t.due && String(t.due) < today) })),
    clients_needing_attention: allClients.filter((c) => c.health !== "good" && c.status !== "churned"),
    clients: allClients,
    campaigns: check(campaigns),
    agents: check(agents),
    team: check(team),
    recent_activity: (check(activity) as Row[]).reverse(),
  };
}
