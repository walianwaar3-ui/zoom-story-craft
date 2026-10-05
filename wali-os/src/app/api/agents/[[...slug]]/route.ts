/**
 * Wali OS — Agent API (OpenRouter backend).
 * Route: /api/agents/[[...slug]]
 *
 * Every method requires the Hermes API key or a signed-in Wali OS user's
 * Supabase access token as `Authorization: Bearer …`, so the OpenRouter key
 * can't be used by anyone who finds the URL.
 */
import { hermesOrUser } from "@/lib/hermes/server";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

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

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.AGENT_MODEL || "deepseek/deepseek-v4-pro";

interface AgentEntry {
  id: string;
  profile: string;
  name: string;
  role: string;
  instructions: string;
  scopes: string[];
  requiresApproval: boolean;
}

const agents: Record<string, AgentEntry> = {
  coo: {
    id: "coo", profile: "default",
    name: "COO", role: "Strategic oversight, client context, knowledge base",
    instructions: "You are the COO of Wali Digital Consulting. Wali is the founder. You oversee strategy, client relationships, agent orchestration, and knowledge management. Diagnose before acting. Verify after executing. Be concise — no filler, no emoji, no em dashes. When Wali asks a question, answer directly.",
    scopes: ["Clients", "Tasks", "Campaigns", "Approvals"], requiresApproval: false,
  },
  operator: {
    id: "operator", profile: "operator",
    name: "Operator", role: "GHL/CRM, automations, integrations, pipeline fixes",
    instructions: "You are the Operator for Wali Digital Consulting. Handle GHL CRM, automations, integrations, sub-accounts, and pipeline fixes. Core rule: diagnose first — clarify before acting, inspect live state, identify root cause, apply minimal fix, verify. Never assume. You do NOT handle Meta Ads, creative, campaign strategy, or client meetings. Be concise, no filler, no emoji.",
    scopes: ["Clients", "Tasks"], requiresApproval: true,
  },
};

function parseSlug(request: Request) {
  const path = new URL(request.url).pathname.replace("/api/agents", "").replace(/^\/+/, "");
  const parts = path.split("/").filter(Boolean);
  return { id: parts[0], action: parts[1] };
}

// ── GET ──

export async function GET(request: Request) {
  if (!(await hermesOrUser(request))) return unauthorized();
  const { id } = parseSlug(request);
  if (!id) return Response.json({ agents: Object.values(agents) });
  const a = agents[id];
  return a ? Response.json(a) : Response.json({ error: "Not found" }, { status: 404 });
}

// ── POST ──

export async function POST(request: Request) {
  if (!(await hermesOrUser(request))) return unauthorized();
  const { id, action } = parseSlug(request);

  // Create agent
  if (!id) {
    const body = await request.json();
    const name = body.name?.trim();
    const role = body.role?.trim();
    if (!name || !role) return Response.json({ error: "name and role required" }, { status: 400 });

    const agentId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (agents[agentId]) return Response.json({ error: "Already exists" }, { status: 409 });

    agents[agentId] = {
      id: agentId, profile: agentId, name, role,
      instructions: body.instructions || body.playbook || `You are ${name}. ${role}.`,
      scopes: body.scopes || body.tools || [],
      requiresApproval: body.requiresApproval ?? true,
    };
    return Response.json({ agent: agents[agentId] }, { status: 201 });
  }

  // Chat
  if (action === "chat") {
    if (!OPENROUTER_KEY) return Response.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });

    const agent = agents[id];
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const history = cleanMessages(body.messages);
    if (!history) return Response.json({ error: "messages must be 1-50 {role: user|assistant, content: string} items" }, { status: 400 });

    const messages = [{ role: "system", content: agent.instructions }, ...history];

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "HTTP-Referer": "https://wali-os.vercel.app",
          "X-Title": "Wali OS",
        },
        body: JSON.stringify({ model: MODEL, messages, stream: false }),
      });

      if (!res.ok) {
        return Response.json({ error: `OpenRouter: ${await res.text()}` }, { status: 502 });
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "";
      return Response.json({ reply });
    } catch (e) {
      return Response.json({ error: `API error: ${(e as Error).message}` }, { status: 502 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

// ── PUT ──

export async function PUT(request: Request) {
  if (!(await hermesOrUser(request))) return unauthorized();
  const { id } = parseSlug(request);
  if (!id || !agents[id]) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await request.json();
  const a = agents[id];
  if (body.name) a.name = body.name;
  if (body.role) a.role = body.role;
  if (body.instructions !== undefined) a.instructions = body.instructions;
  if (body.scopes) a.scopes = body.scopes;
  if (body.requiresApproval !== undefined) a.requiresApproval = body.requiresApproval;
  return Response.json({ agent: a });
}

// ── DELETE ──

export async function DELETE(request: Request) {
  if (!(await hermesOrUser(request))) return unauthorized();
  const { id } = parseSlug(request);
  if (!id || !agents[id]) return Response.json({ error: "Not found" }, { status: 404 });
  delete agents[id];
  return Response.json({ deleted: true });
}