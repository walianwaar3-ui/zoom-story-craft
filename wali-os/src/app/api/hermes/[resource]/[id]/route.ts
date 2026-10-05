import { ApiError, check, handler, json, readBody, requireId } from "@/lib/hermes/server";
import { pick, resource } from "@/lib/hermes/resources";

type Ctx = { params: Promise<{ resource: string; id: string }> };

/** GET /api/hermes/:resource/:id */
export const GET = handler<Ctx>(async (db, _req, ctx) => {
  const { resource: name, id } = await ctx.params;
  const r = resource(name);
  const select = name === "threads" ? "*, messages:email_messages(*)" : "*";
  const row = check(await db.from(r.table).select(select).eq("id", requireId(id)).single());
  return json({ data: row });
});

/** PATCH /api/hermes/:resource/:id — change allowed fields. */
export const PATCH = handler<Ctx>(async (db, req, ctx) => {
  const { resource: name, id } = await ctx.params;
  const r = resource(name);
  const changes = pick(await readBody(req), r.update, "update");
  requireId(id);

  if (name === "threads") changes.updated_at = new Date().toISOString();

  let q = db.from(r.table).update(changes).eq("id", id);
  // Conditional update, so a decision made in Wali OS meanwhile can't be overwritten.
  if (name === "approvals") q = q.eq("status", "pending");
  const updated = check(await q.select().maybeSingle());
  if (!updated) {
    if (name === "approvals") throw new ApiError(409, "Only pending approvals can be edited (or it doesn't exist)");
    throw new ApiError(404, "Not found");
  }
  return json({ data: updated });
});
