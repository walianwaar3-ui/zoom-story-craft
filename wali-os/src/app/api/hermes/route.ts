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
      "GET /api/hermes/meta/kpis?date_preset=last_7d": "Meta Ads KPIs + active campaigns (cached 5 min, &fresh=1 to refresh).",
      "GET /api/hermes/meta/report?date_preset=last_7d": "AI-written Markdown report on the Meta Ads data.",
      "GET /api/hermes/agent-stats": "Per-agent tasks, approvals and last_active (assignee / requested_by = agent name).",
      "GET /api/hermes/:resource?<filter>=…&limit=…": "List records (newest first).",
      "GET /api/hermes/:resource/:id": "One record.",
      "POST /api/hermes/:resource": "Create (approvals are always created pending).",
      "PATCH /api/hermes/:resource/:id": "Change allowed fields.",
      "POST /api/hermes/threads/:id/inbound {body}": "Log an email the contact sent.",
      "POST /api/hermes/threads/:id/submit-reply {body}": "Queue a reply for approval.",
      "POST /api/hermes/threads/:id/sent": "Record that the approved reply was sent.",
      "POST /api/hermes/approvals/:id/executed": "Mark an approved request as carried out.",
      "GET /api/hermes/runs?status=queued": "Runs Wali started from the Agents page (each includes its agent).",
      "POST /api/hermes/runs/:id/start": "Claim a queued run before doing the work.",
      "POST /api/hermes/runs/:id/finish {result}": "Report what you actually did.",
      "POST /api/hermes/runs/:id/fail {error}": "Report why it couldn't be done.",
      "POST /api/hermes/agents/:id/avatar {image_base64, content_type}": "Upload an agent's photo (max 2 MB).",
      "POST /api/agents/:agent/chat {messages}": "Chat as an agent (uses its Wali OS instructions + live context).",
    },
    resources: Object.fromEntries(
      Object.entries(RESOURCES).map(([k, r]) => [k, { create: r.create ?? "read only", update: r.update ?? "read only", filters: r.filters }])
    ),
    rules: [
      "Nothing is deleted through this API.",
      "Only you approve or reject approvals, in Wali OS.",
      "Act only on approvals in approvals_to_carry_out, then call /executed.",
      "Only Wali switches agents on/off or changes 'requires approval'; skip paused agents.",
      "Runs: claim with /start, do the real work, then /finish with what you actually did (or /fail). Never report work you didn't do.",
    ],
  })
);
