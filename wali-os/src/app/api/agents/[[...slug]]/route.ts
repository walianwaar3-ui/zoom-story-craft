/**
 * Wali OS — Agent chat (OpenRouter backend).
 * Route: /api/agents/[[...slug]]
 *
 *   GET  /api/agents               list agents (from Wali OS)
 *   GET  /api/agents/:agent        one agent (id, or name such as "coo")
 *   POST /api/agents/:agent/chat   {messages: [{role: "user"|"assistant", content}]} → {reply}
 *   POST /api/agents/:agent/run    {instruction?} → queues a run; Hermes picks it up, does
 *                                  the work with its real tools and reports back (agent_runs)
 *
 * Agents live in the `agents` table: Hermes creates and edits them through
 * /api/hermes/agents, you switch them on/off in Wali OS. Every call requires the
 * Hermes API key or a signed-in Wali OS user's Supabase access token as
 * `Authorization: Bearer …`, so the OpenRouter key can't be used by anyone who
 * finds the URL.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { clientFile, mentionedClients } from "@/lib/hermes/client-file";
import { buildContext } from "@/lib/hermes/context";
import { adminDb, hermesOrUser } from "@/lib/hermes/server";

const MODEL = process.env.AGENT_MODEL || "deepseek/deepseek-v4-pro";
/** Cap on the live context put in the prompt, to bound cost per message. */
const CONTEXT_CHARS = 40_000;

type AgentRow = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  scopes: string[];
  status: string;
  requires_approval: boolean;
  avatar_url: string;
};

const err = (error: string, status: number) => Response.json({ error }, { status });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Only plain user/assistant turns: callers can't replace the agent's system prompt. */
function cleanMessages(input: unknown) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 50) return null;
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of input) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || m.content.length > 20000) return null;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function parseSlug(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/agents/, "").replace(/^\/+/, "");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { key: parts[0], action: parts[1], extra: parts.length > 2 };
}

async function listAgents(db: SupabaseClient): Promise<AgentRow[]> {
  const { data, error } = await db
    .from("agents")
    .select("id, name, role, instructions, scopes, status, requires_approval, avatar_url")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as AgentRow[];
}

/** Find by id, or by name ("COO", "coo", "email-assistant"). */
async function findAgent(db: SupabaseClient, key: string) {
  const k = slugify(key);
  return (await listAgents(db)).find((a) => a.id === key || slugify(a.name) === k);
}

async function guard(request: Request) {
  if (!(await hermesOrUser(request))) return { res: err("Unauthorized", 401) };
  const db = adminDb();
  if (!db) return { res: err("Server is missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL", 503) };
  return { db };
}

function systemPrompt(agent: AgentRow, context: unknown, files: unknown[] = []) {
  let live = JSON.stringify(context);
  if (live.length > CONTEXT_CHARS) live = live.slice(0, CONTEXT_CHARS) + "…(truncated)";
  const fileText = files.map((f) => {
    const s = JSON.stringify(f);
    return s.length > 30_000 ? s.slice(0, 30_000) + "…(truncated)" : s;
  });
  return [
    agent.instructions || `You are ${agent.name}. ${agent.role}.`,
    "",
    `You are "${agent.name}" inside Wali OS, the operating system of Wali's consulting business.`,
    `Your role: ${agent.role || "not set"}. You work on: ${agent.scopes.join(", ") || "not set"}.`,
    "In this chat you advise and draft; you cannot change data or contact anyone yourself.",
    agent.requires_approval
      ? "Anything you'd send to a client or that costs money must go to Approvals first, for Wali to approve."
      : "",
    "Stay within your role. Base answers on the live data below; say so when something isn't in it.",
    "",
    `Live Wali OS data (${new Date().toISOString()}):`,
    live,
    ...(fileText.length
      ? ["", "Client files for the clients in this conversation (services, meetings with the latest transcript, recent emails). Use them; cite the meeting or email you rely on.", ...fileText]
      : []),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

// ── GET ──

export async function GET(request: Request) {
  const g = await guard(request);
  if (g.res) return g.res;
  const { key, action } = parseSlug(request);
  if (action) return err("Not found", 404);
  try {
    if (!key) return Response.json({ agents: await listAgents(g.db) });
    const a = await findAgent(g.db, key);
    return a ? Response.json(a) : err("Agent not found", 404);
  } catch (e) {
    console.error("agents", e);
    return err("Internal error", 500);
  }
}

// ── POST /api/agents/:agent/chat · POST /api/agents/:agent/run ──

export async function POST(request: Request) {
  const g = await guard(request);
  if (g.res) return g.res;
  const { key, action, extra } = parseSlug(request);
  if (!key || extra)
    return err("Not found. Create or edit agents with /api/hermes/agents; chat with POST /api/agents/:agent/chat", 404);

  if (action === "run") return queueRun(request, g.db, key);
  if (action !== "chat") return err("Not found. Available actions: chat, run", 404);

  const key_ = process.env.OPENROUTER_API_KEY;
  if (!key_) return err("OPENROUTER_API_KEY not set", 503);

  const body = await request.json().catch(() => ({}));
  const history = cleanMessages(body.messages);
  if (!history) return err("messages must be 1-50 {role: user|assistant, content: string} items", 400);

  try {
    const agent = await findAgent(g.db, key);
    if (!agent) return err("Agent not found", 404);
    if (agent.status !== "active") return err(`${agent.name} is paused. Switch it on in Wali OS → Agents.`, 409);

    // Clients named in the recent conversation get their full file attached.
    const recentText = history.slice(-4).map((m) => m.content).join("\n");
    const named = mentionedClients(((await g.db.from("clients").select("id, name, company")).data ?? []) as { id: string; name: string; company: string }[], recentText);
    const files = await Promise.all(named.map((id) => clientFile(g.db, id).catch(() => null)));
    const messages = [{ role: "system", content: systemPrompt(agent, await buildContext(g.db), files.filter(Boolean)) }, ...history];
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key_}`,
        "HTTP-Referer": "https://wali-os.vercel.app",
        "X-Title": "Wali OS",
      },
      body: JSON.stringify({ model: MODEL, messages, stream: false }),
    });
    if (!res.ok) {
      console.error("openrouter", res.status, await res.text());
      return err(`The AI service returned an error (${res.status})`, 502);
    }
    const data = await res.json();
    return Response.json({ reply: data.choices?.[0]?.message?.content || "", agent: { id: agent.id, name: agent.name } });
  } catch (e) {
    console.error("agents chat", e);
    return err("Internal error", 500);
  }
}

/**
 * Queue a run for Hermes. Nothing is executed here: Hermes polls
 * /api/hermes/runs?status=queued, does the work on the VPS with its real tools,
 * and reports the outcome, which the Agents page shows live.
 */
async function queueRun(request: Request, db: SupabaseClient, key: string) {
  const body = await request.json().catch(() => ({}));
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 4000) : "";
  const requestedBy = typeof body.requested_by === "string" ? body.requested_by.trim().slice(0, 200) : "";
  try {
    const agent = await findAgent(db, key);
    if (!agent) return err("Agent not found", 404);
    if (agent.status !== "active") return err(`${agent.name} is paused. Switch it on in Wali OS → Agents.`, 409);
    const { data, error } = await db
      .from("agent_runs")
      .insert({ agent_id: agent.id, instruction: instruction || "Do your next due task.", requested_by: requestedBy || "Wali" })
      .select()
      .single();
    // One queued/running run per agent (unique index).
    if (error?.code === "23505") return err(`${agent.name} already has a run queued or in progress`, 409);
    if (error) throw new Error(error.message);
    return Response.json({ run: data }, { status: 201 });
  } catch (e) {
    console.error("agents run", e);
    return err("Internal error", 500);
  }
}
