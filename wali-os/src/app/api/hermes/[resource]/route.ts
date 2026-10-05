import { check, handler, json, readBody } from "@/lib/hermes/server";
import { pick, resource, selectFor, validateAgent } from "@/lib/hermes/resources";

type Ctx = { params: Promise<{ resource: string }> };

/** GET /api/hermes/:resource?status=…&limit=… — newest first. Threads include their messages. */
export const GET = handler<Ctx>(async (db, req, ctx) => {
  const name = (await ctx.params).resource;
  const r = resource(name);
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);

  let q = db.from(r.table).select(selectFor(name));
  for (const f of r.filters) {
    const v = url.searchParams.get(f);
    if (v !== null) q = q.eq(f, v);
  }
  const rows = check(await q.order(r.order, { ascending: false }).limit(limit));
  return json({ data: rows });
});

/** POST /api/hermes/:resource — create a record. */
export const POST = handler<Ctx>(async (db, req, ctx) => {
  const name = (await ctx.params).resource;
  const r = resource(name);
  const row = pick(await readBody(req), r.create, "create");
  if (name === "agents") validateAgent(row);
  if (name === "approvals") row.status = "pending";
  if (name === "approvals" && !row.requested_by) row.requested_by = "Hermes";
  const created = check(await db.from(r.table).insert(row).select().single());
  return json({ data: created }, 201);
});
