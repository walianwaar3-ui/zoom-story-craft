import { claimOutbox, markOutboxFailed, markOutboxSent } from "@/lib/hermes/gmail";
import { ApiError, handler, json, readBody, requireId } from "@/lib/hermes/server";

type Ctx = { params: Promise<{ id: string; action: string }> };

/** POST /api/hermes/gmail/send/:id/claim | sent {gmail_message_id, gmail_thread_id?, sent_at?} | failed {error} */
export const POST = handler<Ctx>(async (db, req, ctx) => {
  const { id, action } = await ctx.params;
  requireId(id);
  const body = req.headers.get("content-length") === "0" ? {} : await readBody(req).catch(() => ({}));
  if (action === "claim") return json({ data: await claimOutbox(db, id) });
  if (action === "sent") return json({ data: await markOutboxSent(db, id, body) });
  if (action === "failed") return json({ data: await markOutboxFailed(db, id, body) });
  throw new ApiError(404, "Unknown action. Use claim, sent or failed.");
});
