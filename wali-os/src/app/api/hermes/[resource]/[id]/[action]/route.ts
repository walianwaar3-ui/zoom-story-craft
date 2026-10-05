import type { SupabaseClient } from "@supabase/supabase-js";

import { buildContext } from "@/lib/hermes/context";
import { ApiError, check, handler, json, readBody, requireId, requireText } from "@/lib/hermes/server";

type Ctx = { params: Promise<{ resource: string; id: string; action: string }> };
type Body = Record<string, unknown>;
type Thread = { id: string; contact_name: string; contact_email: string; subject: string; client_id: string | null; status: string; approval_id: string | null };
type AgentRow = { id: string; name: string; role: string; instructions: string; scopes: string[]; status: string; requires_approval: boolean };

const MODEL = process.env.AGENT_MODEL || "deepseek/deepseek-v4-pro";
const CONTEXT_CHARS = 40_000;

/**
 * Workflow actions. They follow the same rules as Wali OS (src/lib/workflows.ts):
 *   needs-reply → submit-reply → awaiting-approval → (you approve) → ready-to-send → sent → replied
 */
const ACTIONS: Record<string, Record<string, (db: SupabaseClient, id: string, body: Body) => Promise<unknown>>> = {
  threads: { inbound, "submit-reply": submitReply, sent },
  approvals: { executed },
  agents: { avatar, run },
};

export const POST = handler<Ctx>(async (db, req, ctx) => {
  const { resource, id, action } = await ctx.params;
  const fn = Object.hasOwn(ACTIONS, resource) && Object.hasOwn(ACTIONS[resource], action) ? ACTIONS[resource][action] : undefined;
  if (!fn) throw new ApiError(404, `Unknown action. Available: ${Object.entries(ACTIONS).flatMap(([r, a]) => Object.keys(a).map((x) => `${r}/:id/${x}`)).join(", ")}`);
  const body = req.headers.get("content-length") === "0" ? {} : await readBody(req).catch(() => ({}));
  return json({ data: await fn(db, requireId(id), body) });
});

const now = () => new Date().toISOString();

async function getThread(db: SupabaseClient, id: string): Promise<Thread> {
  return check(await db.from("email_threads").select("*").eq("id", id).single()) as Thread;
}

async function touchClient(db: SupabaseClient, t: Thread, at: string) {
  if (t.client_id) check(await db.from("clients").update({ last_contact: at }).eq("id", t.client_id));
  else if (t.contact_email)
    // Case-insensitive exact match: escape LIKE wildcards in the address.
    check(await db.from("clients").update({ last_contact: at }).ilike("email", t.contact_email.replace(/[\\%_]/g, "\\$&")));
}

/** POST threads/:id/inbound {body} — log an email the contact sent. */
async function inbound(db: SupabaseClient, id: string, body: Body) {
  const text = requireText(body, "body");
  const t = await getThread(db, id);
  const at = now();
  const message = check(await db.from("email_messages").insert({ thread_id: id, direction: "in", body: text, at }).select().single());
  const keep = t.status === "awaiting-approval" || t.status === "ready-to-send";
  check(await db.from("email_threads").update({ status: keep ? t.status : "needs-reply", updated_at: at }).eq("id", id));
  await touchClient(db, t, at);
  return message;
}

/** POST threads/:id/submit-reply {body, requested_by?} — draft a reply and put it in your approval queue. */
async function submitReply(db: SupabaseClient, id: string, body: Body) {
  const text = requireText(body, "body");
  const t = await getThread(db, id);
  if (t.status === "awaiting-approval" || t.status === "ready-to-send")
    throw new ApiError(409, `Thread already has a reply ${t.status === "ready-to-send" ? "approved and waiting to be sent" : "waiting for approval"}`);
  const lastIn = check(
    await db.from("email_messages").select("body").eq("thread_id", id).eq("direction", "in").order("at", { ascending: false }).limit(1)
  ) as { body: string }[];
  const approval = check(
    await db
      .from("approvals")
      .insert({
        type: "Email reply",
        title: `Reply to ${t.contact_name || t.contact_email}: ${t.subject || "(no subject)"}`,
        summary: lastIn[0]?.body.slice(0, 160) ?? "",
        content: text,
        requested_by: typeof body.requested_by === "string" && body.requested_by ? body.requested_by : "Hermes",
        client_id: t.client_id,
        thread_id: id,
        risk: "low",
        status: "pending",
      })
      .select()
      .single()
  ) as { id: string };
  check(await db.from("email_threads").update({ status: "awaiting-approval", approval_id: approval.id, draft: "", updated_at: now() }).eq("id", id));
  return approval;
}

/**
 * POST threads/:id/sent — record that the approved reply was sent. The message
 * stored is the approved text, so what's logged is exactly what you signed off.
 */
async function sent(db: SupabaseClient, id: string) {
  const t = await getThread(db, id);
  if (t.status !== "ready-to-send" || !t.approval_id) throw new ApiError(409, "Thread has no approved reply waiting to be sent");
  const approval = check(await db.from("approvals").select("id, status, content").eq("id", t.approval_id).single()) as {
    id: string;
    status: string;
    content: string;
  };
  if (approval.status !== "approved") throw new ApiError(409, "The reply's approval is not approved");

  const at = now();
  // Claim the thread first so a retried call can't log the reply twice.
  const claimed = check(
    await db
      .from("email_threads")
      .update({ status: "replied", approval_id: null, draft: "", updated_at: at })
      .eq("id", id)
      .eq("status", "ready-to-send")
      .select("id")
      .maybeSingle()
  );
  if (!claimed) throw new ApiError(409, "Thread was already marked sent");
  const message = check(await db.from("email_messages").insert({ thread_id: id, direction: "out", body: approval.content, at }).select().single());
  check(await db.from("approvals").update({ executed_at: at }).eq("id", approval.id).is("executed_at", null));
  await touchClient(db, t, at);
  return message;
}

/** POST approvals/:id/executed — mark an approved request as carried out. */
async function executed(db: SupabaseClient, id: string) {
  const row = check(
    await db.from("approvals").update({ executed_at: now() }).eq("id", id).eq("status", "approved").is("executed_at", null).select().maybeSingle()
  );
  if (!row) throw new ApiError(409, "Approval isn't approved, was already carried out, or doesn't exist");
  return row;
}

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/**
 * POST agents/:id/avatar {image_base64, content_type} — upload the agent's photo
 * (PNG/JPEG/WebP/GIF, max 2 MB) to public storage and set avatar_url. A
 * `data:image/...;base64,` URL also works in image_base64.
 */
async function avatar(db: SupabaseClient, id: string, body: Body) {
  let b64 = requireText(body, "image_base64").trim();
  let type = typeof body.content_type === "string" ? body.content_type : "";
  const dataUrl = /^data:([^;,]+);base64,/.exec(b64);
  if (dataUrl) {
    type ||= dataUrl[1];
    b64 = b64.slice(dataUrl[0].length);
  }
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new ApiError(400, `"content_type" must be one of: ${Object.keys(IMAGE_TYPES).join(", ")}`);
  const bytes = Buffer.from(b64, "base64");
  if (!bytes.length) throw new ApiError(400, '"image_base64" is not valid base64');
  if (bytes.length > 2 * 1024 * 1024) throw new ApiError(413, "Image is larger than 2 MB");

  check(await db.from("agents").select("id").eq("id", id).single());
  // A new file name each time, so browsers don't keep showing the old photo.
  const path = `${id}/${Date.now()}.${ext}`;
  const up = await db.storage.from("agent-avatars").upload(path, bytes, { contentType: type, upsert: false });
  if (up.error) throw new ApiError(400, `Upload failed: ${up.error.message}`);
  const url = db.storage.from("agent-avatars").getPublicUrl(path).data.publicUrl;
  return check(await db.from("agents").update({ avatar_url: url }).eq("id", id).select().single());
}

const systemPrompt = (agent: AgentRow, context: unknown) => {
  let live = JSON.stringify(context);
  if (live.length > CONTEXT_CHARS) live = live.slice(0, CONTEXT_CHARS) + "…(truncated)";
  return [
    agent.instructions || `You are ${agent.name}. ${agent.role}.`,
    "",
    `You are "${agent.name}" inside Wali OS. Your role: ${agent.role || "not set"}. You work on: ${agent.scopes.join(", ") || "not set"}.`,
    "You are being asked to run your next task. Look at the live data below and do what's due for your role.",
    "If you produce output that should go to a client or costs money, note that it needs approval.",
    "",
    `Live Wali OS data (${new Date().toISOString()}):`,
    live,
  ]
    .filter((l) => l !== "")
    .join("\n");
};

/**
 * POST agents/:id/run — trigger the agent to do its next due task.
 * Calls OpenRouter with the agent's instructions + live context, returns the response.
 */
async function run(db: SupabaseClient, id: string): Promise<unknown> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ApiError(503, "OPENROUTER_API_KEY not set");

  const agent = check(await db.from("agents").select("*").eq("id", id).single()) as AgentRow;
  if (!agent) throw new ApiError(404, "Agent not found");
  if (agent.status !== "active") throw new ApiError(409, `${agent.name} is paused`);

  // Gather what's due for this agent
  const [{ data: tasks }, context] = await Promise.all([
    db
      .from("tasks")
      .select("*")
      .neq("status", "done")
      .ilike("assignee", `%${agent.name}%`)
      .order("due", { ascending: true, nullsFirst: false })
      .limit(10),
    buildContext(db),
  ]);

  const dueSummary = {
    tasks: (tasks ?? []).map((t) => ({ title: (t as Record<string, unknown>).title, status: (t as Record<string, unknown>).status, due: (t as Record<string, unknown>).due, priority: (t as Record<string, unknown>).priority })),
    task_count: (tasks ?? []).length,
  };

  const messages = [
    { role: "system", content: systemPrompt(agent, context) },
    {
      role: "user",
      content: `Here's what's assigned to you right now:\n${JSON.stringify(dueSummary, null, 2)}\n\nRun your next due task. If there's nothing that needs doing, say so and suggest what you would work on next.`,
    },
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://wali-os.vercel.app",
      "X-Title": "Wali OS",
    },
    body: JSON.stringify({ model: MODEL, messages, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("openrouter run", res.status, text);
    throw new ApiError(502, `OpenRouter error (${res.status})`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content || "";

  // Log the activity
  check(
    await db.from("activity_log").insert({
      label: `${agent.name} ran — ${reply.slice(0, 120)}${reply.length > 120 ? "…" : ""}`,
      at: new Date().toISOString(),
    })
  );

  return { agent: { id: agent.id, name: agent.name }, reply, tasks_found: dueSummary.task_count };
}
