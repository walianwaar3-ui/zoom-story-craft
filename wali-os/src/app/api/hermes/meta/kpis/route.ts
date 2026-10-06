import { handler, json } from "@/lib/hermes/server";
import { datePreset, metaSnapshot } from "@/lib/hermes/meta";

/**
 * GET /api/hermes/meta/kpis?date_preset=last_7d[&fresh=1]
 * Meta ad account KPIs (spend, impressions, reach, clicks, CTR, CPC, leads, cost per
 * lead) plus active campaigns with their own KPIs. Cached for 5 minutes.
 * Auth: the Hermes key, or a signed-in Wali OS user (Campaigns page).
 */
export const GET = handler(
  async (_db, req) => {
    const url = new URL(req.url);
    return json(await metaSnapshot(datePreset(url.searchParams.get("date_preset")), url.searchParams.get("fresh") === "1"));
  },
  { allowUser: true }
);
