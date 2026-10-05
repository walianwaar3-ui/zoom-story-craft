import { handler, json } from "@/lib/hermes/server";
import { RESOURCES } from "@/lib/hermes/resources";

/** GET /api/hermes — what this API offers. Full guide: wali-os/docs/HERMES.md */
export const GET = handler(async () =>
  json({
    name: "Wali OS API for Hermes",
    auth: "Authorization: Bearer <HERMES_API_KEY>",
    endpoints: {
      "GET /api/hermes/context": "Snapshot of what's going on now. Start here.",
      "GET /api/hermes/activity?since=<id>": "Every change, oldest first. Poll with next_since.",
      "GET /api/hermes/:resource?<filter>=…&limit=…": "List records (newest first).",
      "GET /api/hermes/:resource/:id": "One record.",
      "POST /api/hermes/:resource": "Create (approvals are always created pending).",
      "PATCH /api/hermes/:resource/:id": "Change allowed fields.",
      "POST /api/hermes/threads/:id/inbound {body}": "Log an email the contact sent.",
      "POST /api/hermes/threads/:id/submit-reply {body}": "Queue a reply for approval.",
      "POST /api/hermes/threads/:id/sent": "Record that the approved reply was sent.",
      "POST /api/hermes/approvals/:id/executed": "Mark an approved request as carried out.",
    },
    resources: Object.fromEntries(
      Object.entries(RESOURCES).map(([k, r]) => [k, { create: r.create ?? "read only", update: r.update ?? "read only", filters: r.filters }])
    ),
    rules: [
      "Nothing is deleted through this API.",
      "Only you approve or reject approvals, in Wali OS.",
      "Act only on approvals in approvals_to_carry_out, then call /executed.",
    ],
  })
);
