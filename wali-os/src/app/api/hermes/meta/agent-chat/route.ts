/**
 * POST /api/hermes/meta/agent-chat {message, history?}
 * → {reply, images: [{url, prompt}], approvals: [{id, title, ad?}], tools_used: [...]}
 *
 * Chat with the "Ads Planner" agent (its instructions come from Wali OS → Agents).
 * It can use tools:
 *   - get_account_overview / get_breakdown / get_ad_details: read Meta Ads data and
 *     ad creatives (read-only)
 *   - reuse_ad_image: reuse a winning ad's real image (the default for new concepts)
 *   - generate_ad_image: create ad images with Fal.ai, only when Wali asks for AI images
 *   - create_ad: ONE finished ad per request (reused image + final copy), filed as a
 *     launch-ready approval
 *   - propose_change: put any other change to the ad account in Approvals.
 * It never changes the ad account itself; approved changes are carried out by Hermes.
 *
 * Auth: the Hermes key, or a signed-in Wali OS user.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError, check, handler, json, readBody } from "@/lib/hermes/server";
import { DATE_PRESETS, datePreset, metaAds, metaBreakdown, metaDefaultPageId, metaSnapshot } from "@/lib/hermes/meta";
import { CTA_TYPES, EXECUTE_NUDGE, EXECUTE_RULES, adApprovalContent, adPreviewOf, asksForNewAd, type AdPreview, type AdSpec } from "@/lib/hermes/ad-launch";
import { IMAGE_RULES, ImageRuleError, REUSE_RULES, asksForAiImages, buildAdImagePrompt } from "@/lib/hermes/ad-image-rules";

// 20 tool rounds can take a few minutes; the time budget below stops cleanly before this.
export const maxDuration = 300;

const MODEL = process.env.META_AGENT_MODEL || process.env.AGENT_MODEL || "deepseek/deepseek-v4-pro";
const FAL_MODEL = process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell";
const MAX_STEPS = 20;
/** Stop starting new rounds after this, so a reply always comes back before maxDuration. */
const TIME_BUDGET_MS = 240_000;

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
      name: "get_ad_details",
      description:
        "See ad creatives: primary text, headlines, descriptions, call to action, link and image of one ad (ad_id), or of the ads in a campaign or ad set. Use get_breakdown first to find ids and winners.",
      parameters: {
        type: "object",
        properties: {
          ad_id: { type: "string", description: "One ad" },
          campaign_id: { type: "string", description: "List ads in this campaign" },
          adset_id: { type: "string", description: "List ads in this ad set" },
          include_inactive: { type: "boolean", description: "Also paused/archived ads (default false)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reuse_ad_image",
      description:
        "Reuse an existing ad's real image (usually the winner from get_breakdown) for new concepts and variations. Returns its image_url and image_hash and shows the image to Wali. This is the default for creatives.",
      parameters: {
        type: "object",
        properties: { ad_id: { type: "string", description: "The ad whose image to reuse" } },
        required: ["ad_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_ad_image",
      description:
        "Only when Wali explicitly asks for AI-generated images; otherwise use reuse_ad_image. Generate ad creative images with Fal.ai. Every image must show real people (the coach/consultant and/or their clients) as the main subject. Empty desks, empty offices, laptops on tables and objects-only scenes are rejected. Keep text in the image short or absent; Meta penalises text-heavy images.",
      parameters: {
        type: "object",
        properties: {
          people: {
            type: "string",
            description: "Who is in the shot and what they are doing, e.g. 'a confident female coach in her 40s leading a video call, smiling client visible on screen'",
          },
          prompt: { type: "string", description: "Setting, style, lighting, composition around those people. No empty scenes." },
          format: { type: "string", enum: ["square", "portrait", "story", "landscape"], description: "square 1:1 feed, portrait 4:5-ish feed, story 9:16, landscape 16:9" },
          count: { type: "integer", minimum: 1, maximum: 4 },
        },
        required: ["people", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_ad",
      description:
        "Create ONE finished new ad from a winning ad: reuses its image and ad set, with your final copy. Files it as a launch-ready approval; Wali taps Approve and Hermes launches it. One per request.",
      parameters: {
        type: "object",
        properties: {
          source_ad_id: { type: "string", description: "The winning ad to build on (its image and ad set are reused)" },
          hook: { type: "string", description: "First line of the primary text: the scroll-stopper" },
          body: { type: "string", description: "Rest of the primary text, after the hook" },
          headline: { type: "string", description: "Short headline under the image (max ~40 characters)" },
          description: { type: "string", description: "Optional link description" },
          call_to_action: { type: "string", enum: CTA_TYPES, description: "Default: same as the winner" },
          link: { type: "string", description: "Default: the winner's link" },
          image_url: { type: "string", description: "Only if Wali asked for AI images: a generated image_url from this message" },
          why: { type: "string", description: "One line: why this should beat the winner" },
          status: { type: "string", enum: ["PAUSED", "ACTIVE"], description: "Default PAUSED. ACTIVE only if Wali said to run it live." },
        },
        required: ["source_ad_id", "hook", "body", "headline", "why"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_change",
      description:
        "Propose a change to the Meta ad account other than a new ad (pause/resume, budget change, new campaign or ad set, creative swap). For new ads use create_ad. Creates an Approval for Wali; nothing changes until Wali approves and Hermes carries it out. Be exact: ids, names, amounts.",
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
    const approvals: { id: string; title: string; ad?: AdPreview }[] = [];
    const toolsUsed: string[] = [];
    const generated = new Set<string>();
    let adCreated = false;

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
        case "get_ad_details": {
          const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
          const ads = await metaAds({
            adId: str(args.ad_id),
            parentId: str(args.adset_id) ?? str(args.campaign_id),
            activeOnly: args.include_inactive !== true,
          });
          // Show the current creatives to Wali under the reply (max 8 images per message).
          for (const ad of ads) {
            if (ad.image_url && /^https:\/\//.test(ad.image_url) && images.length < 8 && !images.some((i) => i.url === ad.image_url))
              images.push({ url: ad.image_url, prompt: `Current ad: ${ad.name}` });
          }
          return { ads, note: "Creative images are shown to Wali below your reply." };
        }
        case "reuse_ad_image": {
          const adId = typeof args.ad_id === "string" ? args.ad_id : "";
          const [ad] = await metaAds({ adId });
          if (!ad?.image_url || !/^https:\/\//.test(ad.image_url))
            return { error: `Ad ${adId} has no reusable image (format: ${ad?.format ?? "unknown"}). Pick another winning image ad.` };
          if (!images.some((i) => i.url === ad.image_url)) {
            if (images.length >= 8) return { error: "Image limit for this message reached (8)" };
            images.push({ url: ad.image_url, prompt: `Reused from: ${ad.name}` });
          }
          return {
            ad_id: ad.ad_id,
            name: ad.name,
            image_url: ad.image_url,
            image_hash: ad.image_hash,
            current_copy: { primary_text: ad.primary_text, headlines: ad.headlines, call_to_action: ad.call_to_action, link: ad.link },
            note: "Shown to Wali below your reply. Now call create_ad with this ad as source_ad_id and your final copy.",
          };
        }
        case "generate_ad_image": {
          // Server-side, so the model can't fall back to AI people on its own.
          if (!asksForAiImages(message))
            return {
              error:
                "Refused: Wali didn't ask for AI-generated images. Reuse the winning ad's real image with reuse_ad_image and write new angles. Wali can say \"generate new images\" to allow AI images.",
            };
          if (!String(args.prompt ?? "").trim()) return { error: "prompt is required" };
          if (images.length >= 8) return { error: "Image limit for this message reached (8)" };
          let prompt: string;
          try {
            prompt = buildAdImagePrompt(String(args.people ?? "").slice(0, 500), String(args.prompt ?? "").slice(0, 1500));
          } catch (e) {
            if (e instanceof ImageRuleError) return { error: e.message, rules: IMAGE_RULES };
            throw e;
          }
          const urls = await falImages(prompt, String(args.format ?? "square"), Number(args.count ?? 1) || 1);
          urls.forEach((url) => {
            images.push({ url, prompt });
            generated.add(url);
          });
          return { images: urls, note: "Shown to Wali below your reply." };
        }
        case "create_ad": {
          if (adCreated) return { error: "One ad per request: this message already created one. Wali asks again for the next." };
          const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
          const hook = text(args.hook, 300);
          const body = text(args.body, 2500);
          const headline = text(args.headline, 120);
          if (!hook || !body || !headline) return { error: "hook, body and headline are required" };
          const [src] = await metaAds({ adId: text(args.source_ad_id, 40) });
          if (!src?.adset_id) return { error: `Ad ${args.source_ad_id} not found or has no ad set` };
          const aiImage = text(args.image_url, 1000);
          if (aiImage && !generated.has(aiImage)) return { error: "image_url must be an image generated in this message; leave it out to reuse the winner's image" };
          const imageUrl = aiImage || src.image_url;
          if (!imageUrl) return { error: `Ad ${src.ad_id} has no reusable image (format: ${src.format}). Pick a winning image ad.` };
          const link = text(args.link, 1000) || src.link || "";
          if (!/^https:\/\//.test(link)) return { error: "No https link: pass link (the landing page or form URL)" };
          const cta = text(args.call_to_action, 40) || src.call_to_action || "LEARN_MORE";
          if (!(CTA_TYPES as readonly string[]).includes(cta) && cta !== src.call_to_action) return { error: `call_to_action must be one of ${CTA_TYPES.join(", ")}` };
          const status = args.status === "ACTIVE" ? "ACTIVE" : "PAUSED";
          // Meta needs the Facebook Page the ad runs as. Never send a placeholder like "0".
          const pageId = src.page_id ?? (await metaDefaultPageId());
          if (!pageId)
            return {
              error: "Couldn't find the Facebook Page for this ad. Tell Wali to set META_PAGE_ID in Vercel (Page settings → Page ID). Don't create the ad without it.",
            };
          const spec: AdSpec = {
            source: {
              ad_id: src.ad_id,
              name: src.name,
              adset_id: src.adset_id,
              campaign_id: src.campaign_id,
              creative_id: src.creative_id,
              page_id: pageId,
              instagram_user_id: src.instagram_user_id,
            },
            image: { image_hash: aiImage ? null : src.image_hash, image_url: imageUrl },
            copy: { hook, primary_text: `${hook}\n\n${body}`, headline, description: text(args.description, 300) || null, call_to_action: cta, link },
            name: `${src.name} | ${headline}`.slice(0, 200),
            status,
          };
          const row = check(
            await db
              .from("approvals")
              .insert({
                type: "Campaign",
                title: `Launch ad: ${headline}`.slice(0, 200),
                summary: `New ad from "${src.name}" (${status}). ${text(args.why, 400)}`.slice(0, 1000),
                content: adApprovalContent(spec),
                requested_by: agent.name,
                value: null,
                risk: status === "ACTIVE" ? "medium" : "low",
                status: "pending",
              })
              .select("id, title")
              .single()
          ) as { id: string; title: string };
          adCreated = true;
          // The chat shows this as an ad preview card with Approve / Reject, so no separate image.
          approvals.push({ ...row, ad: adPreviewOf(spec) });
          return { approval_id: row.id, status: "pending", ad: spec.copy, launch_status: status, note: "Filed. Wali taps Approve in Approvals and Hermes launches it." };
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
      "You cannot change the ad account yourself. New ads: create_ad (files a launch-ready approval). Anything else (pause, resume, budgets, new campaigns): propose_change. Both go to Approvals and Hermes carries them out after Wali approves.",
      "Generated images and ad creatives you look up appear below your reply automatically; refer to them briefly, don't paste URLs.",
      "",
      EXECUTE_RULES,
      "",
      REUSE_RULES,
      "",
      "When Wali does ask for AI images:",
      IMAGE_RULES,
      "",
      "Reply in concise Markdown. No filler, no emoji, no em dashes.",
    ].join("\n");

    const messages: Msg[] = [{ role: "system", content: system }, ...history, { role: "user", content: message }];
    let reply = "";
    // Server-side "execute": if Wali asked for an ad and the model only talked, send it back once.
    let nudged = !asksForNewAd(message);

    const started = Date.now();
    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        reply = "This took too long, so I stopped here. Ask me to continue and I'll pick up from this point.";
        break;
      }
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
        if (!nudged && !adCreated && step < MAX_STEPS - 2) {
          nudged = true;
          messages.push({ role: "assistant", content: msg.content || "(no ad created)" }, { role: "user", content: EXECUTE_NUDGE });
          continue;
        }
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
