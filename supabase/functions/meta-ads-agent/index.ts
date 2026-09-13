import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH = "https://graph.facebook.com/v21.0";
const ANTHROPIC_MODEL = "claude-sonnet-4-5";
const MIN_BUDGET = 5;
const MAX_BUDGET = 500;
const ALLOWED_OBJECTIVES = ["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS"];
const MAX_TOOL_ROUNDS = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function callGraph(
  path: string,
  token: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
) {
  const url = `${GRAPH}${path}`;
  const init: RequestInit = { method };
  if (method === "GET") {
    const sep = path.includes("?") ? "&" : "?";
    return doFetch(`${url}${sep}access_token=${encodeURIComponent(token)}`, init);
  }
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body || {})) {
    form.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  form.set("access_token", token);
  init.body = form;
  return doFetch(url, init);
}

async function doFetch(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Meta API error (HTTP ${res.status})`;
    const code = data?.error?.code;
    const subcode = data?.error?.error_subcode;
    let hint = "";
    if (code === 100 && subcode === 1885183) {
      hint = " (Meta app is in Development mode — it can't create ad creatives until it's Live.)";
    }
    throw new Error(`${message}${hint}`);
  }
  return data;
}

const TOOLS = [
  {
    name: "create_paused_ad",
    description:
      "Build a complete Meta ad (campaign + ad set + creative + ad) in the connected account. Everything is created PAUSED — nothing spends until a human activates it in Ads Manager. There is no tool to activate an ad; do not claim you can.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short human-readable name for the campaign, e.g. 'Plumber reel — USA traffic'." },
        objective: { type: "string", enum: ALLOWED_OBJECTIVES },
        daily_budget: { type: "number", description: `Daily budget in the ad account's currency, ${MIN_BUDGET}-${MAX_BUDGET}.` },
        primary_text: { type: "string", description: "The ad copy / caption shown in the post." },
        headline: { type: "string", description: "Short headline (only used for link ads)." },
        link_url: { type: "string", description: "Destination URL. Required when objective is OUTCOME_TRAFFIC." },
        image_url: { type: "string", description: "Public image URL to use as the ad creative, if any." },
        countries: {
          type: "array",
          items: { type: "string" },
          description: "ISO-2 country codes to target, e.g. ['US']. Defaults to ['US'].",
        },
      },
      required: ["name", "objective", "daily_budget", "primary_text"],
    },
  },
  {
    name: "get_account_report",
    description: "Fetch real spend/performance insights for the connected ad account over a trailing window.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Trailing window in days: 7, 30, or 90. Defaults to 30." },
      },
    },
  },
  {
    name: "list_recent_ads",
    description: "List the ads this assistant has created recently, with their paused/incomplete status and review links.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max rows to return, defaults to 10." },
      },
    },
  },
];

function clampBudget(v: unknown): { budget: number; note: string | null } {
  const n = typeof v === "number" && Number.isFinite(v) ? v : MIN_BUDGET;
  if (n < MIN_BUDGET) return { budget: MIN_BUDGET, note: `Requested budget was below the $${MIN_BUDGET}/day floor — clamped to $${MIN_BUDGET}/day.` };
  if (n > MAX_BUDGET) return { budget: MAX_BUDGET, note: `Requested budget was above the $${MAX_BUDGET}/day ceiling — clamped to $${MAX_BUDGET}/day.` };
  return { budget: Math.round(n * 100) / 100, note: null };
}

function clampObjective(v: unknown): { objective: string; note: string | null } {
  if (typeof v === "string" && ALLOWED_OBJECTIVES.includes(v)) return { objective: v, note: null };
  return { objective: "OUTCOME_TRAFFIC", note: `Unrecognized objective — defaulted to OUTCOME_TRAFFIC.` };
}

async function runCreatePausedAd(supabase: any, connection: any, input: any) {
  const { budget, note: budgetNote } = clampBudget(input.daily_budget);
  const { objective, note: objectiveNote } = clampObjective(input.objective);
  const countries = Array.isArray(input.countries) && input.countries.length ? input.countries : ["US"];
  const name = String(input.name || "Untitled campaign").slice(0, 120);

  if (!connection.page_id) {
    return {
      success: false,
      message:
        "No Facebook Page is linked to this System User token, so a creative can't be built. Add a Page as an asset the token can manage, then reconnect.",
    };
  }
  if (objective === "OUTCOME_TRAFFIC" && !input.link_url) {
    return { success: false, message: "OUTCOME_TRAFFIC ads need a link_url — ask the user what URL the ad should point to." };
  }

  const token = connection.access_token;
  const acct = connection.ad_account_id;
  let campaignId: string | null = null;
  let adsetId: string | null = null;

  try {
    const campaign = await callGraph(`/act_${acct}/campaigns`, token, "POST", {
      name,
      objective,
      status: "PAUSED",
      special_ad_categories: [],
    });
    campaignId = campaign.id;

    const optimizationGoal =
      objective === "OUTCOME_TRAFFIC" ? "LINK_CLICKS" : objective === "OUTCOME_ENGAGEMENT" ? "POST_ENGAGEMENT" : "REACH";

    const adset = await callGraph(`/act_${acct}/adsets`, token, "POST", {
      name: `${name} — adset`,
      campaign_id: campaignId,
      daily_budget: Math.round(budget * 100),
      billing_event: "IMPRESSIONS",
      optimization_goal: optimizationGoal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: { geo_locations: { countries }, age_min: 18 },
      status: "PAUSED",
      start_time: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    adsetId = adset.id;

    let imageHash: string | null = null;
    if (input.image_url) {
      const imgRes = await callGraph(`/act_${acct}/adimages`, token, "POST", { url: input.image_url });
      const first = Object.values(imgRes.images || {})[0] as any;
      imageHash = first?.hash || null;
    }

    const linkData: Record<string, unknown> = {
      message: String(input.primary_text || "").slice(0, 2000),
      link: input.link_url || `https://www.facebook.com/${connection.page_id}`,
    };
    if (input.headline) linkData.name = String(input.headline).slice(0, 100);
    if (imageHash) linkData.image_hash = imageHash;

    const creative = await callGraph(`/act_${acct}/adcreatives`, token, "POST", {
      name: `${name} — creative`,
      object_story_spec: { page_id: connection.page_id, link_data: linkData },
    });

    const ad = await callGraph(`/act_${acct}/ads`, token, "POST", {
      name,
      adset_id: adsetId,
      creative: { creative_id: creative.id },
      status: "PAUSED",
    });

    const reviewUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${acct}&selected_campaign_ids=${campaignId}`;

    await supabase.from("meta_ad_drafts").insert({
      name,
      objective,
      daily_budget: budget,
      currency: connection.currency,
      status: "PAUSED",
      campaign_id: campaignId,
      adset_id: adsetId,
      ad_id: ad.id,
      ad_account_id: acct,
      review_url: reviewUrl,
    });

    const notes = [budgetNote, objectiveNote].filter(Boolean);
    return {
      success: true,
      status: "PAUSED",
      review_url: reviewUrl,
      campaign_id: campaignId,
      notes,
      message: `Built and paused at $${budget}/day, targeting ${countries.join(", ")}. Nothing spends until you activate it in Ads Manager.`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown Meta API error";
    const reviewUrl = campaignId
      ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${acct}&selected_campaign_ids=${campaignId}`
      : null;

    if (campaignId) {
      await supabase.from("meta_ad_drafts").insert({
        name,
        objective,
        daily_budget: budget,
        currency: connection.currency,
        status: "INCOMPLETE",
        campaign_id: campaignId,
        adset_id: adsetId,
        ad_account_id: acct,
        review_url: reviewUrl,
        failure_reason: message,
      });
    }

    return {
      success: false,
      message: campaignId
        ? `The push failed partway through (${message}). A campaign was created but is incomplete — delete it in Ads Manager: ${reviewUrl}`
        : `Failed before anything was created: ${message}`,
    };
  }
}

async function runGetAccountReport(connection: any, input: any) {
  const days = [7, 30, 90].includes(input?.days) ? input.days : 30;
  const datePreset = days === 7 ? "last_7d" : days === 90 ? "last_90d" : "last_30d";
  const data = await callGraph(
    `/act_${connection.ad_account_id}/insights?fields=spend,clicks,impressions,reach,ctr,cpc,cpm,actions,video_p50_watched_actions&date_preset=${datePreset}`,
    connection.access_token,
  );
  const row = data?.data?.[0] || {};
  const actions: Array<{ action_type: string; value: string }> = row.actions || [];
  const leads = actions.find((a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped")?.value;
  const videoViews = (row.video_p50_watched_actions || [])[0]?.value;

  const report = {
    window_days: days,
    spend: row.spend ? Number(row.spend) : 0,
    currency: connection.currency,
    ctr: row.ctr ? Number(row.ctr) : null,
    cpc: row.cpc ? Number(row.cpc) : null,
    cpm: row.cpm ? Number(row.cpm) : null,
    link_clicks: row.clicks ? Number(row.clicks) : 0,
    impressions: row.impressions ? Number(row.impressions) : 0,
    reach: row.reach ? Number(row.reach) : 0,
    leads: leads ? Number(leads) : null,
    video_views: videoViews ? Number(videoViews) : null,
  };
  return report;
}

async function runListRecentAds(supabase: any, input: any) {
  const limit = typeof input?.limit === "number" ? Math.min(50, Math.max(1, input.limit)) : 10;
  const { data } = await supabase
    .from("meta_ad_drafts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "chat";
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    const postContext = body.post || null;

    const supabase = admin();
    const { data: connection } = await supabase
      .from("meta_connections")
      .select("*")
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!connection) {
      if (action === "report") return json({ error: "not_connected" }, 409);
      return json({
        reply:
          "You haven't connected a Meta ad account yet. Head to the connection card above, paste your System User token and ad account ID, then come back and I can start building campaigns.",
        ads: [],
      });
    }

    // Fast path: the Report panel polls this directly without spending a Claude call.
    if (action === "report") {
      try {
        const report = await runGetAccountReport(connection, { days: body.days });
        return json({ report });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Failed to load report" }, 502);
      }
    }

    if (!incomingMessages.length) return json({ error: "messages is required" }, 400);

    const systemPrompt = `You are the Meta Ads assistant embedded in ZoomPost. You turn the user's content into Meta (Facebook/Instagram) ad campaigns by calling tools — that is the only way you can reach Meta.

Connected account: ${connection.ad_account_name || connection.ad_account_id} (${connection.currency || "account currency"}). Publishing as Page: ${connection.page_name || "no Page connected"}.

Hard rules, never break these:
- Every campaign/ad you create is PAUSED. There is no activation tool. Never imply an ad is live or spending — a human must turn it on in Ads Manager.
- Objective must be exactly one of OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_AWARENESS.
- Daily budget must be between $${MIN_BUDGET} and $${MAX_BUDGET}. If asked for more or less, the tool clamps it — tell the user that happened.
- If a push fails partway (e.g. campaign created but the ad creative fails), say plainly what got created and that it needs to be deleted manually in Ads Manager. Never soften or hide a partial failure.
- Be concise. This is a chat panel, not a report.${
      postContext
        ? `\n\nThe user is looking at this generated post right now — use it as the ad copy/creative unless they say otherwise:\nCaption: ${postContext.caption || "(none)"}\nImage: ${postContext.image_url || "(none)"}`
        : ""
    }`;

    const messages = incomingMessages.map((m: any) => ({ role: m.role, content: m.content }));
    let lastReport: unknown = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1200,
          system: systemPrompt,
          tools: TOOLS,
          messages,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Anthropic error:", res.status, errText);
        return json({ error: `Claude API error (HTTP ${res.status})` }, 502);
      }

      const data = await res.json();
      const blocks: any[] = data.content || [];
      messages.push({ role: "assistant", content: blocks });

      if (data.stop_reason !== "tool_use") {
        const reply = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        const { data: ads } = await supabase
          .from("meta_ad_drafts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10);
        return json({ reply: reply || "Done.", ads: ads || [], report: lastReport });
      }

      const toolUses = blocks.filter((b) => b.type === "tool_use");
      const toolResults = [];
      for (const use of toolUses) {
        let result: unknown;
        try {
          if (use.name === "create_paused_ad") {
            result = await runCreatePausedAd(supabase, connection, use.input || {});
          } else if (use.name === "get_account_report") {
            result = await runGetAccountReport(connection, use.input || {});
            lastReport = result;
          } else if (use.name === "list_recent_ads") {
            result = await runListRecentAds(supabase, use.input || {});
          } else {
            result = { error: `Unknown tool: ${use.name}` };
          }
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "Tool execution failed" };
        }
        toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result) });
      }
      messages.push({ role: "user", content: toolResults });
    }

    const { data: ads } = await supabase
      .from("meta_ad_drafts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    return json({
      reply: "That took more steps than expected — tell me what you'd like next and I'll pick it back up.",
      ads: ads || [],
      report: lastReport,
    });
  } catch (e) {
    console.error("meta-ads-agent error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
