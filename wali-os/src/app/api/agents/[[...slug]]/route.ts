/**
 * Hermes Agent API Bridge for Wali OS.
 * Route: /api/agents/[[...slug]]
 *
 * Endpoints:
 *   GET  /api/agents              → list agents
 *   POST /api/agents              → create agent (→ Hermes profile)
 *   GET  /api/agents/[id]         → get agent
 *   PUT  /api/agents/[id]         → update agent
 *   DELETE /api/agents/[id]       → delete agent
 *   POST /api/agents/[id]/chat    → send message, get reply
 */

const HERMES_URL = process.env.HERMES_API_URL || "http://localhost:8642";
const HERMES_KEY = process.env.HERMES_API_KEY;

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
    instructions: "You are the COO of Wali Digital Consulting. Diagnose before acting.",
    scopes: ["Clients", "Tasks", "Campaigns", "Approvals"], requiresApproval: false,
  },
  operator: {
    id: "operator", profile: "operator",
    name: "Operator", role: "GHL/CRM, automations, integrations, pipeline fixes",
    instructions: "You are the Operator. Diagnose first. Verify after executing.",
    scopes: ["Clients", "Tasks"], requiresApproval: true,
  },
};

function auth() {
  if (!HERMES_KEY) return Response.json({ error: "HERMES_API_KEY not set" }, { status: 500 });
  return null;
}

function parseSlug(request: Request) {
  const path = new URL(request.url).pathname.replace("/api/agents", "").replace(/^\/+/, "");
  const parts = path.split("/").filter(Boolean);
  return { id: parts[0], action: parts[1] };
}

// ── GET ──

export async function GET(request: Request) {
  const { id } = parseSlug(request);
  if (!id) return Response.json({ agents: Object.values(agents) });
  const a = agents[id];
  return a ? Response.json(a) : Response.json({ error: "Not found" }, { status: 404 });
}

// ── POST ──

export async function POST(request: Request) {
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
      instructions: body.instructions || body.playbook || "",
      scopes: body.scopes || body.tools || [],
      requiresApproval: body.requiresApproval ?? true,
    };
    return Response.json({ agent: agents[agentId] }, { status: 201 });
  }

  // Chat — uses hermes CLI directly (no API key needed)
  if (action === "chat") {
    const agent = agents[id];
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const body = await request.json();
    if (!body.messages?.length) return Response.json({ error: "messages required" }, { status: 400 });

    const lastMsg = body.messages[body.messages.length - 1].content;

    try {
      const { execSync } = await import("child_process");
      const raw = execSync(
        `hermes -p ${agent.profile} chat -q ${JSON.stringify(lastMsg)}`,
        { timeout: 60000, maxBuffer: 1024 * 1024, env: { ...process.env, HOME: "/opt/data" } }
      ).toString();

      // Extract the agent's reply from CLI output
      const reply = raw
        .replace(/^Query:.*$/m, "")
        .replace(/Initializing agent.*$/m, "")
        .replace(/─+/g, "")
        .replace(/Resume this session with:[\s\S]*$/m, "")
        .replace(/Session:[\s\S]*$/m, "")
        .replace(/Title:.*$/m, "")
        .replace(/Duration:.*$/m, "")
        .replace(/Messages:.*$/m, "")
        .replace(/╭─.*$/m, "")
        .replace(/╰─.*$/m, "")
        .replace(/Reasoning[\s\S]*?──┘/s, "")
        .replace(/☤ Hermes[\s\S]*?──╮/s, "")
        .trim();

      return Response.json({ reply: reply || raw.trim() });
    } catch (e) {
      return Response.json({ error: `Agent: ${(e as Error).message}` }, { status: 502 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

// ── PUT ──

export async function PUT(request: Request) {
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
  const { id } = parseSlug(request);
  if (!id || !agents[id]) return Response.json({ error: "Not found" }, { status: 404 });
  delete agents[id];
  return Response.json({ deleted: true });
}