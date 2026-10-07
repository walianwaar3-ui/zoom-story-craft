import type { Approval, ApprovalStatus, Db, EmailThread } from "@/lib/data/types";
import { newId, nowIso } from "@/lib/store";

/**
 * Email reply lifecycle:
 * needs-reply → (submit) awaiting-approval → (approve) ready-to-send → (mark sent) replied
 *                                           → (reject)  needs-reply, draft restored for editing
 */

function patchThread(db: Db, id: string, fn: (t: EmailThread) => EmailThread): Db {
  return { ...db, threads: db.threads.map((t) => (t.id === id ? fn(t) : t)) };
}

function touchClient(db: Db, thread: EmailThread, at: string): Db {
  const email = thread.contactEmail.toLowerCase();
  return {
    ...db,
    clients: db.clients.map((c) =>
      c.id === thread.clientId || (email && c.email.toLowerCase() === email) ? { ...c, lastContact: at } : c
    ),
  };
}

export function submitReplyForApproval(db: Db, threadId: string, body: string, requestedBy: string): Db {
  const thread = db.threads.find((t) => t.id === threadId);
  if (!thread) return db;
  const approval: Approval = {
    id: newId(),
    type: "Email reply",
    title: `Reply to ${thread.contactName || thread.contactEmail}: ${thread.subject || "(no subject)"}`,
    summary: thread.messages.filter((m) => m.direction === "in").at(-1)?.body.slice(0, 160) ?? "",
    content: body,
    requestedBy,
    clientId: thread.clientId,
    threadId,
    risk: "low",
    status: "pending",
    createdAt: nowIso(),
  };
  const next = { ...db, approvals: [approval, ...db.approvals] };
  return patchThread(next, threadId, (t) => ({ ...t, status: "awaiting-approval", approvalId: approval.id, draft: "", updatedAt: nowIso() }));
}

export function decideApproval(
  db: Db,
  approvalId: string,
  status: Exclude<ApprovalStatus, "pending">,
  content: string,
  note?: string
): Db {
  const approval = db.approvals.find((a) => a.id === approvalId);
  if (!approval) return db;
  let next: Db = {
    ...db,
    approvals: db.approvals.map((a) =>
      a.id === approvalId ? { ...a, status, content, decidedAt: nowIso(), decisionNote: note || undefined } : a
    ),
  };
  if (approval.threadId) {
    next = patchThread(next, approval.threadId, (t) =>
      t.approvalId !== approvalId
        ? t
        : status === "approved"
        ? { ...t, status: "ready-to-send", approvalId, updatedAt: nowIso() }
        : { ...t, status: "needs-reply", approvalId: undefined, draft: content, updatedAt: nowIso() }
    );
  }
  return next;
}

/** Move a decided approval back into the queue (undo). */
export function reopenApproval(db: Db, approvalId: string): Db {
  const approval = db.approvals.find((a) => a.id === approvalId);
  if (!approval) return db;
  let next: Db = {
    ...db,
    approvals: db.approvals.map((a) => (a.id === approvalId ? { ...a, status: "pending", decidedAt: undefined, decisionNote: undefined } : a)),
  };
  if (approval.threadId) {
    // Only re-link the thread if no newer reply has taken its place.
    next = patchThread(next, approval.threadId, (t) =>
      t.status === "replied" || (t.approvalId && t.approvalId !== approvalId)
        ? t
        : { ...t, status: "awaiting-approval", approvalId, draft: "", updatedAt: nowIso() }
    );
  }
  return next;
}

export function markReplySent(db: Db, threadId: string, body: string): Db {
  const thread = db.threads.find((t) => t.id === threadId);
  if (!thread) return db;
  const at = nowIso();
  const next = patchThread(db, threadId, (t) => ({
    ...t,
    status: "replied",
    approvalId: undefined,
    draft: "",
    messages: [...t.messages, { id: newId(), direction: "out", body, at }],
    updatedAt: at,
  }));
  return touchClient(next, thread, at);
}

export function logInbound(db: Db, threadId: string, body: string): Db {
  const thread = db.threads.find((t) => t.id === threadId);
  if (!thread) return db;
  const at = nowIso();
  const next = patchThread(db, threadId, (t) => ({
    ...t,
    status: t.status === "awaiting-approval" || t.status === "ready-to-send" ? t.status : "needs-reply",
    messages: [...t.messages, { id: newId(), direction: "in", body, at }],
    updatedAt: at,
  }));
  return touchClient(next, thread, at);
}

export function approvedReplyFor(db: Db, thread: EmailThread) {
  return thread.approvalId ? db.approvals.find((a) => a.id === thread.approvalId) : undefined;
}

/** Re: subject for a reply, without stacking "Re: Re:". */
export function replySubject(subject: string) {
  const s = subject.trim();
  return /^re:/i.test(s) ? s : `Re: ${s || "(no subject)"}`;
}

/**
 * Queue a reply for Hermes to send from Gmail. The thread shows it as sending
 * until Hermes reports it sent (then it becomes a message) or failed.
 */
export function queueReply(db: Db, threadId: string, body: string, requestedBy: string, approvalId?: string): Db {
  const thread = db.threads.find((t) => t.id === threadId);
  if (!thread || !body.trim()) return db;
  const item = {
    id: newId(),
    threadId,
    toEmail: thread.contactEmail,
    subject: replySubject(thread.subject),
    body: body.trim(),
    status: "queued" as const,
    error: "",
    approvalId,
    requestedBy,
    createdAt: nowIso(),
  };
  const next = { ...db, outbox: [item, ...db.outbox] };
  return patchThread(next, threadId, (t) => ({ ...t, status: "ready-to-send", draft: "", updatedAt: nowIso() }));
}

/** Pull a queued reply back before Hermes sends it; its text returns to the draft. */
export function cancelQueuedReply(db: Db, outboxId: string): Db {
  const item = db.outbox.find((o) => o.id === outboxId);
  if (!item || (item.status !== "queued" && item.status !== "failed")) return db;
  const next = { ...db, outbox: db.outbox.map((o) => (o.id === outboxId ? { ...o, status: "cancelled" as const } : o)) };
  return patchThread(next, item.threadId, (t) => ({
    ...t,
    status: item.approvalId && t.approvalId === item.approvalId ? "ready-to-send" : "needs-reply",
    draft: item.approvalId ? t.draft : item.body,
    updatedAt: nowIso(),
  }));
}

export function retryQueuedReply(db: Db, outboxId: string): Db {
  return { ...db, outbox: db.outbox.map((o) => (o.id === outboxId && o.status === "failed" ? { ...o, status: "queued" as const, error: "", claimedAt: undefined } : o)) };
}

/** The reply in flight for a thread (queued, sending or failed), if any. */
export function pendingReplyFor(db: Db, threadId: string) {
  return db.outbox.find((o) => o.threadId === threadId && (o.status === "queued" || o.status === "sending" || o.status === "failed"));
}
