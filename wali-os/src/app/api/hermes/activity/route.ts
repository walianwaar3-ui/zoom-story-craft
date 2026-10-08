import { activityFeed } from "@/lib/hermes/activity";
import { ApiError, check, handler, json } from "@/lib/hermes/server";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Two views of what's happening in Wali OS:
 *
 * GET /api/hermes/activity?days=1   (or ?from=<ISO>&to=<ISO>)
 *   The daily feed: one merged timeline of emails, tasks created and done,
 *   meetings processed, client updates, approvals and ads pushed to Meta,
 *   newest first. Each entry: {id, type, title, client_id, client_name, at,
 *   detail, link}. `days` (1–30) is a rolling window back from now.
 *
 * GET /api/hermes/activity?since=<id>&limit=100
 *   Every raw change to Wali OS data, oldest first after `since`. Poll with the
 *   last `id` you saw to follow what's happening. `actor` is "hermes" for your
 *   own writes, otherwise the signed-in user's email.
 *
 * Auth: the Hermes key, or a signed-in Wali OS user (the Dashboard feed).
 */
export const GET = handler(
  async (db, req) => {
    const url = new URL(req.url);
    const daysRaw = url.searchParams.get("days");
    const fromRaw = url.searchParams.get("from");

    if (daysRaw !== null || fromRaw !== null) {
      const now = Date.now();
      const toRaw = url.searchParams.get("to");
      const to = toRaw === null ? new Date(now) : new Date(toRaw);
      let from: Date;
      if (fromRaw !== null) {
        from = new Date(fromRaw);
      } else {
        const days = Number(daysRaw);
        if (!Number.isFinite(days) || days <= 0 || days > 30) throw new ApiError(400, '"days" must be a number from 1 to 30');
        from = new Date(now - days * DAY_MS);
      }
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ApiError(400, '"from" and "to" must be ISO date-times');
      if (from >= to) throw new ApiError(400, '"from" must be before "to"');
      if (to.getTime() - from.getTime() > 31 * DAY_MS) throw new ApiError(400, "The window can be at most 31 days");

      const data = await activityFeed(db, from.toISOString(), to.toISOString());
      return json({ from: from.toISOString(), to: to.toISOString(), count: data.length, data });
    }

    const sinceRaw = url.searchParams.get("since");
    const since = sinceRaw === null ? null : Number(sinceRaw);
    if (since !== null && !Number.isSafeInteger(since)) throw new ApiError(400, '"since" must be an activity id');
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);

    const rows =
      since === null
        ? // No cursor: the latest entries, returned oldest first.
          (check(await db.from("activity_log").select("*").order("id", { ascending: false }).limit(limit)) as { id: number }[]).reverse()
        : (check(await db.from("activity_log").select("*").gt("id", since).order("id").limit(limit)) as { id: number }[]);
    return json({ data: rows, next_since: rows.at(-1)?.id ?? since });
  },
  { allowUser: true }
);
