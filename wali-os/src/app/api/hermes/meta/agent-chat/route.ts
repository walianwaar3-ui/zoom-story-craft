/**
 * POST /api/hermes/meta/agent-chat {message, history?}
 * → {reply, images: [{url, prompt}], approvals: [{id, title}], tools_used: [...]}
 *
 * Chat with the "Ads Planner" agent (its instructions come from Wali OS → Agents).
 * It can use tools:
 *   - get_account_overview / get_breakdown: read Meta Ads data (read-only)
 *   - generate_ad_image: create ad images with Fal.ai
 *   - propose_change: put a change to the ad account in Approvals.
 * It never changes the ad account itself; approved changes are carried out by Hermes.
 *
 * Auth: the Hermes key, or a signed-in Wali OS user.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError, check, handler, json, readBody } from "@/lib/hermes/server";
import { DATE_PRESETS, datePreset, metaBreakdown, metaSnapshot } from "@/lib/hermes/meta";

export const maxDuration = 120;

const MODEL = process.env.META_AGENT_MODEL || process.env.AGENT_MODEL || "deepseek/deepseek-v4-pro";
const FAL_MODEL = process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell";
const MAX_STEPS = 6;

type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_account_overview",
      description: "Meta ad account KPIs (spend, impressions, reach, clicks, CTR, CPC, leads, cost per lead) and active campaigns with their KPIs and budgets.",
      parameters: {
        type: "object",
        properties: { date_preset: { type: "string", enum: DATE_PRESETS, description: "Default last_7d" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_breakdown",
      description: "Performance per campaign, ad set or ad (incl. frequency), optionally within one campaign. Use to find winners and losers.",
      parameters: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["campaign", "adset", "ad"] },
          date_preset: { type: "string", enum: DATE_PRESETS },
          campaign_id: { type: "string", description: "Optional campaign id to look inside" },
        },
        required: ["level"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_ad_image",
      description: "Generate ad creative images with Fal.ai from a detailed visual prompt. Keep text in the image short or absent; Meta penalises text-heavy images.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Detailed visual description: subject, setting, style, lighting, composition" },
          format: { type: "string", enum: ["square", "portrait", "story", "landscape"], description: "square 1:1 feed, portrait 4:5-ish feed, story 9:16, landscape 16:9" },
          count: { type: "integer", minimum: 1, maximum: 4 },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_change",
      description:
        "Propose a change to the Meta ad account (pause/resume, budget change, new campaign, ad set or ad, creative swap). Creates an Approval for Wali; nothing changes until Wali approves and Hermes carries it out. Be exact: ids, names, amounts.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short, e.g. 'Raise October ATL Program budget to $30/day'" },
          summary: { type: "string", description: "One line: why, with the evidence" },
          change: { type: "string", description: "Exact change to make, step by step, with ids and amounts" },
          value: { type: "number", description: "Money involved per day or in total, if any" },
          risk: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title", "summary", "change", "risk"],
      },
    },
  },
];

const FAL_SIZES: Record<string, string> = { square: "square_hd", portrait: "portrait_4_3", story: "portrait_16_9", landscape: "landscape_16_9" };

async function falImages(prompt: string, format: string, count: number) {
  const key = process.env.FAL_KEY;
  if (!key) throw new ApiError(503, "FAL_KEY not set");
  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_size: FAL_SIZES[format] ?? "square_hd", num_images: Math.min(Math.max(count, 1), 4) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("fal", res.status, JSON.stringify(data).slice(0, 500));
    throw new Error(`Fal image generation failed (${res.status})`);
  }
  return ((data.images ?? []) as { url: string }[]).map((i) => i.url).filter((u) => /^https:\/\//.test(u));
}

type Agent = { id: string; name: string; role: string; instructions: string; status: string; requires_approval: boolean };

async function findAdsAgent(db: SupabaseClient): Promise<Agent> {
  const rows = check(await db.from("agents").select("id, name, role, instructions, status, requires_approval").ilike("name", "%ads%")) as Agent[];
  const agent = rows.find((a) => /ads planner/i.test(a.name)) ?? rows[0];
  if (!agent) throw new ApiError(404, 'No "Ads Planner" agent in Wali OS. Create one in Agents (or have Hermes create it).');
  if (agent.status !== "active") throw new ApiError(409, `${agent.name} is paused. Switch it on in Wali OS → Agents.`);
  return agent;
}

function cleanHistory(input: unknown) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 40) throw new ApiError(400, "history must be up to 40 {role: user|assistant, content} items");
  return input.map((m) => {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || m.content.length > 20000)
      throw new ApiError(400, "history items must be {role: user|assistant, content: string}");
    return { role: m.role, content: m.content } as Msg;
  });
}

export const POST = handler(
  async (db, req) => {
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey) throw new ApiError(503, "OPENROUTER_API_KEY not set");
    const body = await readBody(req);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 8000) throw new ApiError(400, '"message" is required (max 8000 characters)');
    const history = cleanHistory(body.history);
    const agent = await findAdsAgent(db);

    const images: { url: string; prompt: string }[] = [];
    const approvals: { id: string; title: string }[] = [];
    const toolsUsed: string[] = [];

    const run = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      toolsUsed.push(name);
      switch (name) {
        case "get_account_overview":
          return metaSnapshot(datePreset(typeof args.date_preset === "string" ? args.date_preset : null));
        case "get_breakdown": {
          const level = args.level === "adset" || args.level === "ad" ? args.level : "campaign";
          const campaign = typeof args.campaign_id === "string" && args.campaign_id ? args.campaign_id : undefined;
          return metaBreakdown(level, datePreset(typeof args.date_preset === "string" ? args.date_preset : null), campaign);
        }
        case "generate_ad_image": {
          const prompt = String(args.prompt ?? "").slice(0, 2000);
          if (!prompt) return { error: "prompt is required" };
          if (images.length >= 8) return { error: "Image limit for this message reached (8)" };
          const urls = await falImages(prompt, String(args.format ?? "square"), Number(args.count ?? 1) || 1);
          urls.forEach((url) => images.push({ url, prompt }));
          return { images: urls, note: "Shown to Wali below your reply." };
        }
        case "propose_change": {
          const risk = ["low", "medium", "high"].includes(String(args.risk)) ? String(args.risk) : "medium";
          const value = typeof args.value === "number" && Number.isFinite(args.value) ? args.value : null;
          const row = check(
            await db
              .from("approvals")
              .insert({
                type: "Campaign",
                title: String(args.title ?? "Meta Ads change").slice(0, 200),
                summary: String(args.summary ?? "").slice(0, 1000),
                content: String(args.change ?? "").slice(0, 8000),
                requested_by: agent.name,
                value,
                risk,
                status: "pending",
              })
              .select("id, title")
              .single()
          ) as { id: string; title: string };
          approvals.push(row);
          return { approval_id: row.id, status: "pending", note: "Waiting for Wali's approval in Wali OS → Approvals. Nothing has changed yet." };
        }
        default:
          return { error: `Unknown tool ${name}` };
      }
    };

    const system = [
      agent.instructions || `You are ${agent.name}. ${agent.role}.`,
      "",
      `You are "${agent.name}" inside Wali OS, chatting with Wali on the Campaigns page.`,
      "Use the tools to look at real Meta Ads data before answering; never invent numbers.",
      "You cannot change the ad account. To change anything (pause, resume, budgets, new campaigns/ads, creatives), use propose_change: it goes to Approvals and Hermes carries it out after Wali approves. Say clearly that it is proposed, not done.",
      "Generated images appear below your reply automatically; describe them briefly, don't paste URLs.",
      "Reply in concise Markdown. No filler, no emoji, no em dashes.",
    ].join("\n");

    const messages: Msg[] = [{ role: "system", content: system }, ...history, { role: "user", content: message }];
    let reply = "";

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${orKey}`,
          "HTTP-Referer": "https://wali-os.vercel.app",
          "X-Title": "Wali OS",
        },
        body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: "auto", stream: false }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("openrouter ads chat", res.status, text.slice(0, 500));
        if (/tool/i.test(text) && res.status === 404)
          throw new ApiError(502, `The model ${MODEL} doesn't support tools on OpenRouter. Set META_AGENT_MODEL in Vercel to a tool-capable model.`);
        throw new ApiError(502, `The AI service returned an error (${res.status})`);
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message ?? {};
      const calls = (msg.tool_calls ?? []) as ToolCall[];
      if (!calls.length) {
        reply = String(msg.content ?? "").trim();
        break;
      }
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
      for (const call of calls) {
        let result: unknown;
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          result = await run(call.function.name, args);
        } catch (e) {
          result = { error: e instanceof ApiError || e instanceof Error ? e.message : "Tool failed" };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 30000) });
      }
      if (step === MAX_STEPS - 1) reply = "I ran out of steps for this message. Ask me to continue, or narrow the question.";
    }

    return json({ reply, images, approvals, tools_used: toolsUsed, agent: { id: agent.id, name: agent.name } });
  },
  { allowUser: true }
);
