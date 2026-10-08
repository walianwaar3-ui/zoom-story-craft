/**
 * Gathers the rows behind the daily activity feed (src/lib/activity-feed.ts)
 * for a time window. Server only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildActivityFeed, iso, type ActivitySources } from "@/lib/activity-feed";

import { check } from "./server";

type Row = Record<string, unknown>;
const CAP = 500;

export async function activityFeed(db: SupabaseClient, from: string, to: string) {
  const [messages, outbox, tasksCreated, taskLogs, meetings, clientLogs, approvals, campaigns, newClients] = await Promise.all([
    db.from("email_messages").select("id, direction, body, at, gmail_message_id, thread:email_threads(id, subject, contact_name, contact_email, client_id)").gte("at", from).lte("at", to)
      .order("at", { ascending: false })
      .limit(CAP),
    db.from("email_outbox").select("id, thread_id, to_email, subject, sent_at, gmail_message_id, thread:email_threads(client_id, contact_name)").eq("status", "sent").gte("sent_at", from).lte("sent_at", to).limit(CAP),
    db.from("tasks").select("id, title, assignee, client_id, created_at").gte("created_at", from).lte("created_at", to).limit(CAP),
    // Tasks have no completed_at: the activity log says when their status changed.
    db.from("activity_log").select("row_id, at").eq("table_name", "tasks").eq("action", "update").contains("changed", ["status"]).gte("at", from).lte("at", to)
      .order("at", { ascending: false })
      .limit(CAP),
    db.from("client_meetings").select("id, client_id, title, occurred_at, created_at, action_items").gte("created_at", from).lte("created_at", to).limit(CAP),
    db.from("activity_log").select("id, row_id, at, changed").eq("table_name", "clients").eq("action", "update").gte("at", from).lte("at", to).limit(CAP * 2),
    db
      .from("approvals")
      .select("id, type, title, status, requested_by, client_id, created_at, decided_at, executed_at")
      .or(`and(created_at.gte.${from},created_at.lte.${to}),and(decided_at.gte.${from},decided_at.lte.${to}),and(executed_at.gte.${from},executed_at.lte.${to})`)
      .limit(CAP),
    db.from("campaigns").select("id, name, channel, status, created_at").gte("created_at", from).lte("created_at", to).limit(CAP),
    db.from("clients").select("id").gte("created_at", from).lte("created_at", to).limit(CAP),
  ]);

  // Latest status change per task, kept only for tasks that are done now.
  const doneAt = new Map<string, string>();
  for (const l of check(taskLogs) as Row[]) if (!doneAt.has(String(l.row_id))) doneAt.set(String(l.row_id), String(l.at));
  const doneTasks = doneAt.size
    ? (check(await db.from("tasks").select("id, title, assignee, client_id, status").in("id", [...doneAt.keys()]).eq("status", "done")) as Row[])
    : [];

  const messageRows = check(messages) as Row[];
  const outboxRows = (check(outbox) as Row[]).map(({ thread, ...o }) => ({ ...o, ...((thread as Row) ?? {}) }));
  const meetingRows = check(meetings) as Row[];
  const clientUpdates = check(clientLogs) as ActivitySources["clientUpdates"];
  const approvalRows = check(approvals) as Row[];
  const taskRows = check(tasksCreated) as Row[];

  // Every client an entry names, so lines can say who.
  const clientIds = new Set<string>();
  const addId = (v: unknown) => v && clientIds.add(String(v));
  messageRows.forEach((m) => addId((m.thread as Row | null)?.client_id));
  outboxRows.forEach((o) => addId(o.client_id));
  [...taskRows, ...doneTasks, ...meetingRows, ...approvalRows].forEach((r) => addId(r.client_id));
  clientUpdates.forEach((u) => addId(u.row_id));
  (check(newClients) as Row[]).forEach((c) => addId(c.id));
  const clients = clientIds.size
    ? (check(await db.from("clients").select("id, name, status, health, next_action, created_at").in("id", [...clientIds])) as Row[])
    : [];

  return buildActivityFeed({
    from,
    to,
    clients,
    messages: messageRows,
    outboxSent: outboxRows,
    tasksCreated: taskRows,
    tasksDone: doneTasks.map((task) => ({ task, at: iso(doneAt.get(String(task.id))) })),
    meetings: meetingRows,
    clientUpdates,
    approvals: approvalRows,
    campaigns: check(campaigns) as Row[],
  });
}
