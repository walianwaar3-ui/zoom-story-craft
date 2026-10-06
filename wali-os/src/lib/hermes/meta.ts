/**
 * Server-only Meta Marketing API helpers for /api/hermes/meta/*. Reads
 * META_ACCESS_TOKEN and META_AD_ACCOUNT_ID; never import from client code.
 */
import { ApiError } from "./server";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

export const DATE_PRESETS = ["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export function datePreset(v: string | null): DatePreset {
  if (!v) return "last_7d";
  if (!(DATE_PRESETS as readonly string[]).includes(v)) throw new ApiError(400, `"date_preset" must be one of: ${DATE_PRESETS.join(", ")}`);
  return v as DatePreset;
}

/** Lead actions in order of preference; Meta reports leads under several types. */
const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"];

type Action = { action_type: string; value: string };
type RawInsights = { spend?: string; impressions?: string; clicks?: string; ctr?: string; cpc?: string; reach?: string; actions?: Action[] };

export interface Kpis {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number; // percent
  cpc: number | null;
  leads: number;
  cost_per_lead: number | null;
}

function leadsFrom(actions: Action[] = []) {
  for (const t of LEAD_TYPES) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

function kpis(raw: RawInsights | undefined): Kpis {
  const spend = Number(raw?.spend ?? 0);
  const impressions = Number(raw?.impressions ?? 0);
  const clicks = Number(raw?.clicks ?? 0);
  const leads = leadsFrom(raw?.actions);
  return {
    spend,
    impressions,
    reach: Number(raw?.reach ?? 0),
    clicks,
    ctr: raw?.ctr ? Number(raw.ctr) : impressions ? (clicks / impressions) * 100 : 0,
    cpc: raw?.cpc ? Number(raw.cpc) : clicks ? spend / clicks : null,
    leads,
    cost_per_lead: leads ? spend / leads : null,
  };
}

function config() {
  const token = process.env.META_ACCESS_TOKEN;
  const account = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "").trim();
  if (!token || !account) throw new ApiError(503, "Meta isn't connected: set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in Vercel");
  return { token, account: `act_${account}` };
}

async function graph<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Token in the header, not the URL, so it never lands in logs.
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    if (e.code === 190) throw new ApiError(502, "Meta token is expired or invalid: update META_ACCESS_TOKEN in Vercel");
    if (e.code === 4 || e.code === 17 || e.code === 613) throw new ApiError(429, "Meta rate limit reached, try again in a few minutes");
    console.error("meta graph", res.status, e.code, e.message);
    throw new ApiError(502, `Meta API error: ${e.message ?? res.status}`);
  }
  return data as T;
}

/** Insights per campaign, ad set or ad (read-only), for the Ads Planner chat. */
export async function metaBreakdown(level: "campaign" | "adset" | "ad", preset: DatePreset, campaignId?: string) {
  const { token, account } = config();
  if (campaignId && !/^\d+$/.test(campaignId)) throw new ApiError(400, "campaign_id must be numeric");
  const res = await graph<{ data: (RawInsights & Record<string, string>)[] }>(
    `${campaignId ?? account}/insights`,
    {
      level,
      date_preset: preset,
      fields: "campaign_name,adset_name,ad_name,ad_id,adset_id,spend,impressions,reach,clicks,ctr,cpc,actions,frequency",
      limit: "50",
    },
    token
  );
  return (res.data ?? []).map((r) => ({
    campaign: r.campaign_name,
    adset: r.adset_name,
    ad: r.ad_name,
    ad_id: r.ad_id,
    adset_id: r.adset_id,
    frequency: r.frequency ? Number(r.frequency) : null,
    ...kpis(r),
  }));
}

type RawCreative = {
  id?: string;
  name?: string;
  title?: string;
  body?: string;
  call_to_action_type?: string;
  thumbnail_url?: string;
  image_url?: string;
  image_hash?: string;
  video_id?: string;
  instagram_permalink_url?: string;
  object_story_spec?: {
    page_id?: string;
    instagram_user_id?: string;
    instagram_actor_id?: string;
    link_data?: { message?: string; name?: string; description?: string; link?: string; picture?: string; image_hash?: string; call_to_action?: { type?: string } };
    video_data?: {
      message?: string;
      title?: string;
      link_description?: string;
      image_url?: string;
      image_hash?: string;
      video_id?: string;
      call_to_action?: { type?: string; value?: { link?: string } };
    };
  };
  asset_feed_spec?: {
    bodies?: { text: string }[];
    titles?: { text: string }[];
    descriptions?: { text: string }[];
    link_urls?: { website_url?: string }[];
    call_to_action_types?: string[];
  };
};
type RawAd = {
  id: string;
  name?: string;
  effective_status?: string;
  campaign?: { id: string; name: string };
  adset?: { id: string; name: string };
  creative?: RawCreative;
};

const AD_FIELDS =
  "id,name,effective_status,campaign{id,name},adset{id,name}," +
  "creative{id,name,title,body,call_to_action_type,thumbnail_url,image_url,image_hash,video_id,instagram_permalink_url,object_story_spec,asset_feed_spec}";

/** Copy, CTA, link and images of an ad's creative, flattened across the formats Meta uses. */
function creativeOf(c: RawCreative = {}) {
  const link = c.object_story_spec?.link_data;
  const video = c.object_story_spec?.video_data;
  const feed = c.asset_feed_spec;
  const texts = (xs?: { text: string }[]) => (xs ?? []).map((x) => x.text).filter(Boolean);
  const primary = [c.body, link?.message, video?.message, ...texts(feed?.bodies)].filter(Boolean) as string[];
  const headlines = [c.title, link?.name, video?.title, ...texts(feed?.titles)].filter(Boolean) as string[];
  const descriptions = [link?.description, video?.link_description, ...texts(feed?.descriptions)].filter(Boolean) as string[];
  return {
    creative_id: c.id ?? null,
    // Needed to launch a new ad from this one (Facebook page and Instagram account it runs as).
    page_id: c.object_story_spec?.page_id ?? null,
    instagram_user_id: c.object_story_spec?.instagram_user_id ?? c.object_story_spec?.instagram_actor_id ?? null,
    format: video || c.video_id ? "video" : feed ? "dynamic (multiple text/assets)" : "image/link",
    primary_text: [...new Set(primary)],
    headlines: [...new Set(headlines)],
    descriptions: [...new Set(descriptions)],
    call_to_action: c.call_to_action_type ?? link?.call_to_action?.type ?? video?.call_to_action?.type ?? feed?.call_to_action_types?.[0] ?? null,
    link: link?.link ?? video?.call_to_action?.value?.link ?? feed?.link_urls?.[0]?.website_url ?? null,
    image_url: c.image_url ?? link?.picture ?? video?.image_url ?? c.thumbnail_url ?? null,
    // Meta's id for the uploaded image: lets a new ad reuse the exact same picture.
    image_hash: c.image_hash ?? link?.image_hash ?? video?.image_hash ?? null,
    instagram_permalink: c.instagram_permalink_url ?? null,
  };
}

/**
 * Ads with their creative (copy, CTA, link, image). Read-only. One ad by id, or
 * the ads inside a campaign or ad set.
 */
export async function metaAds(opts: { adId?: string; parentId?: string; activeOnly?: boolean }) {
  const { token } = config();
  const id = opts.adId ?? opts.parentId;
  if (!id || !/^\d+$/.test(id)) throw new ApiError(400, "Give a numeric ad_id, or a campaign_id / adset_id");
  const shape = (a: RawAd) => ({
    ad_id: a.id,
    name: a.name ?? "",
    status: a.effective_status ?? "",
    campaign: a.campaign?.name ?? null,
    campaign_id: a.campaign?.id ?? null,
    adset: a.adset?.name ?? null,
    adset_id: a.adset?.id ?? null,
    ...creativeOf(a.creative),
  });
  if (opts.adId) return [shape(await graph<RawAd>(id, { fields: AD_FIELDS }, token))];
  const params: Record<string, string> = { fields: AD_FIELDS, limit: "25" };
  if (opts.activeOnly !== false) params.effective_status = JSON.stringify(["ACTIVE"]);
  const res = await graph<{ data: RawAd[] }>(`${id}/ads`, params, token);
  return (res.data ?? []).map(shape);
}

export interface MetaSnapshot {
  account: { id: string; name: string; currency: string; timezone: string };
  date_preset: DatePreset;
  kpis: Kpis;
  campaigns: {
    id: string;
    name: string;
    objective: string;
    status: string;
    daily_budget: number | null;
    lifetime_budget: number | null;
    kpis: Kpis;
  }[];
  generated_at: string;
}

// Short in-memory cache per warm server instance, to stay well under Meta's rate limits.
const cache = new Map<DatePreset, { at: number; data: MetaSnapshot }>();
const TTL_MS = 5 * 60 * 1000;

export async function metaSnapshot(preset: DatePreset, fresh = false): Promise<MetaSnapshot> {
  const hit = cache.get(preset);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const { token, account } = config();
  const insightFields = "spend,impressions,reach,clicks,ctr,cpc,actions";
  const [acct, insights, campaigns] = await Promise.all([
    graph<{ id: string; name: string; currency: string; timezone_name: string }>(account, { fields: "name,currency,timezone_name" }, token),
    graph<{ data: RawInsights[] }>(`${account}/insights`, { date_preset: preset, fields: insightFields, level: "account" }, token),
    graph<{
      data: {
        id: string;
        name: string;
        objective?: string;
        effective_status?: string;
        daily_budget?: string;
        lifetime_budget?: string;
        insights?: { data: RawInsights[] };
      }[];
    }>(
      `${account}/campaigns`,
      {
        fields: `id,name,objective,effective_status,daily_budget,lifetime_budget,insights.date_preset(${preset}){${insightFields}}`,
        effective_status: JSON.stringify(["ACTIVE"]),
        limit: "100",
      },
      token
    ),
  ]);

  // Budgets come in the currency's minor unit (cents).
  const money = (v?: string) => (v ? Number(v) / 100 : null);
  const data: MetaSnapshot = {
    account: { id: acct.id, name: acct.name, currency: acct.currency, timezone: acct.timezone_name },
    date_preset: preset,
    kpis: kpis(insights.data?.[0]),
    campaigns: (campaigns.data ?? [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        objective: c.objective ?? "",
        status: c.effective_status ?? "",
        daily_budget: money(c.daily_budget),
        lifetime_budget: money(c.lifetime_budget),
        kpis: kpis(c.insights?.data?.[0]),
      }))
      .sort((a, b) => b.kpis.spend - a.kpis.spend),
    generated_at: new Date().toISOString(),
  };
  cache.set(preset, { at: Date.now(), data });
  return data;
}
