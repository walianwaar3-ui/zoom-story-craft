import { handler, json } from "@/lib/hermes/server";
import { rangeDays, siteReport, timeZone } from "@/lib/hermes/site-analytics";

/**
 * GET /api/hermes/site/analytics?days=30&tz=Asia/Karachi
 * Website analytics for tawakkulgrowth.com (from tg_events): funnel, page drop-off,
 * sources, campaigns, bookings. days: 1, 7, 30, 90 or 365. tz buckets the daily chart.
 * Auth: the Hermes key, or a signed-in Tawakkul Growth OS user (Analytics page).
 */
export const GET = handler(
  async (db, req) => {
    const url = new URL(req.url);
    return json(await siteReport(db, rangeDays(url.searchParams.get("days")), timeZone(url.searchParams.get("tz"))));
  },
  { allowUser: true }
);
