import { ApiError, check, handler, json, readBody, requireId } from "@/lib/hermes/server";
import { pick, resource, selectFor, validateAgent } from "@/lib/hermes/resources";

type Ctx = { params: Promise<{ resource: string; id: string }> };

/** GET /api/hermes/:resource/:id */
export const GET = handler<Ctx>(async (db, _req, ctx) => {
  const { resource: name, id } = await ctx.params;
  const r = resource(name);
  // One meeting comes with its transcript.
  const select = selectFor(name, { transcript: true });
  const row = check(await db.from(r.table).select(select).eq("id", requireId(id)).single());
  return json({ data: row });
});

/** PATCH /api/hermes/:resource/:id — change allowed fields. */
export const PATCH = handler<Ctx>(async (db, req, ctx) => {
  const { resource: name, id } = await ctx.params;
  const r = resource(name);
  const changes = pick(await readBody(req), r.update, "update");
  requireId(id);

  if (name === "agents") validateAgent(changes);
  if (name === "threads") changes.updated_at = new Date().toISOString();

  let q = db.from(r.table).update(changes).eq("id", id);
  // Conditional update, so a decision made in Tawakkul Growth OS meanwhile can't be overwritten.
  if (name === "approvals") q = q.eq("status", "pending");
  const updated = check(await q.select().maybeSingle());
  if (!updated) {
    if (name === "approvals") throw new ApiError(409, "Only pending approvals can be edited (or it doesn't exist)");
    throw new ApiError(404, "Not found");
  }
  return json({ data: updated });
});

/** Resources Hermes may delete. Everything else stays delete-proof. */
const DELETABLE = new Set(["clients"]);

/**
 * DELETE /api/hermes/clients/:id — permanently delete a client.
 * The client's services/projects are deleted with it (database cascade);
 * tasks, emails, approvals and meetings are kept and unlinked.
 */
export const DELETE = handler<Ctx>(async (db, _req, ctx) => {
  const { resource: name, id } = await ctx.params;
  const r = resource(name);
  if (!DELETABLE.has(name)) throw new ApiError(405, `Deleting ${name} is not allowed`);
  requireId(id);
  const deleted = check(await db.from(r.table).delete().eq("id", id).select("id").maybeSingle());
  if (!deleted) throw new ApiError(404, "Not found");
  return json({ deleted: true, id });
});
