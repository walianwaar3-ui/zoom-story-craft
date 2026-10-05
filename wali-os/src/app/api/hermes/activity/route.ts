import { ApiError, check, handler, json } from "@/lib/hermes/server";

/**
 * GET /api/hermes/activity?since=<id>&limit=100
 * Every change to Wali OS data, oldest first after `since`. Poll with the last
 * `id` you saw to follow what's happening. `actor` is "hermes" for your own
 * writes, otherwise the signed-in user's email.
 */
export const GET = handler(async (db, req) => {
  const url = new URL(req.url);
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
});
