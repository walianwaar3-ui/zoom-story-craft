# Connecting Hermes to Wali OS

Wali OS is the face; Supabase is the shared memory; Hermes is the operator.

```
Hermes (your VPS) ──HTTPS + HERMES_API_KEY──▶ Wali OS API (Vercel) ──▶ Supabase ◀── Wali OS app (you, signed in)
```

Hermes calls the Wali OS API. Nothing on your VPS is exposed: Hermes only makes outgoing requests.
Everything Hermes writes appears in your open app within a second, and every change (yours or
Hermes's) lands in the activity feed.

## 1. Setup

**Vercel (wali-os → Settings → Environment Variables), server-only, never `NEXT_PUBLIC_`:**

| Variable | Value |
|---|---|
| `HERMES_API_KEY` | A random secret, 32+ characters (`openssl rand -hex 32`). The same value goes to Hermes. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` (secret). Only the API routes read it. |

Redeploy after changing them. Until both are set, the API answers `401` or `503`.

**Hermes (`~/.hermes/.env`, `chmod 600`):**

```
WALI_OS_URL=https://<your wali-os domain>
WALI_OS_API_KEY=<same value as HERMES_API_KEY>
```

Every request sends `Authorization: Bearer $WALI_OS_API_KEY`. To revoke Hermes's access, change
`HERMES_API_KEY` in Vercel and redeploy.

## 2. Staying in the loop

**Start every session with the snapshot:**

```bash
curl -s "$WALI_OS_URL/api/hermes/context" -H "Authorization: Bearer $WALI_OS_API_KEY"
```

It returns `summary` (counts, MRR, overdue tasks), `approvals_pending` (waiting on the human),
`approvals_to_carry_out` (approved, not yet done: **your to-do list**), `email_threads_open` with the
last message, `tasks_open` (with `overdue`), `clients_needing_attention`, `clients`, `campaigns`,
`agents` (your playbooks), `team`, and `recent_activity`.

**Follow changes live by polling the activity feed** (every 30–60 s is plenty):

```bash
curl -s "$WALI_OS_URL/api/hermes/activity?since=$LAST_ID" -H "Authorization: Bearer $WALI_OS_API_KEY"
# → { "data": [ { id, at, actor, table_name, action, row_id, label, changed[] } ], "next_since": 1234 }
```

`actor` is `hermes` for your own writes, otherwise the human's email. `changed` lists the columns an
update touched. Omit `since` to get the latest 100. Store `next_since` and pass it next time.

## 3. Endpoints

`GET /api/hermes` lists all of this, including the exact fields each resource accepts.

| Call | Does |
|---|---|
| `GET /api/hermes/context` | Snapshot of what's going on. |
| `GET /api/hermes/activity?since=<id>&limit=100` | Changes after `since`, oldest first. |
| `GET /api/hermes/meta/kpis?date_preset=last_7d` | Meta ad account KPIs (spend, impressions, reach, clicks, CTR, CPC, leads, cost per lead) and active campaigns with their KPIs. Presets: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month. Cached 5 min; `&fresh=1` bypasses. |
| `GET /api/hermes/meta/report?date_preset=last_7d` | AI-written Markdown report on that data (`report`). |
| `POST /api/hermes/meta/agent-chat` `{ "message", "history"? }` | Chat with the Ads Planner agent. Tools: read Meta data and ad creatives (`get_ad_details`: copy, CTA, link, image), generate ad images (Fal; every image must show real people as the main subject: empty desks, offices and objects-only scenes are rejected server-side, see `src/lib/hermes/ad-image-rules.ts`), and `propose_change`, which creates a **Campaign approval** (requested_by = the agent). It never changes the ad account; after Wali approves, you carry the change out and call `/executed`. Returns `{reply, images, approvals, tools_used}`. |
| `GET /api/hermes/agent-stats` | Per agent: tasks (todo / in_progress incl. review / done), approvals pending and last 24h, `last_active`. Tasks count when `assignee` names the agent, approvals when `requested_by` does (whole word, any case). |
| `GET /api/hermes/:resource?<filter>=<value>&limit=100` | List, newest first. |
| `GET /api/hermes/:resource/:id` | One record. Threads include `messages`. |
| `POST /api/hermes/:resource` | Create. Body: JSON with allowed fields. |
| `PATCH /api/hermes/:resource/:id` | Change allowed fields. |
| `POST /api/hermes/threads/:id/inbound` `{ "body" }` | Log an email the contact sent. |
| `POST /api/hermes/threads/:id/submit-reply` `{ "body", "requested_by"? }` | Put a reply in the approval queue. |
| `POST /api/hermes/threads/:id/sent` | After sending an **approved** reply: logs the approved text, marks the thread replied and the approval carried out. |
| `POST /api/hermes/approvals/:id/executed` | Mark an approved request as carried out. |
| `POST /api/hermes/runs/:id/start` | Claim a queued run (queued → running). `409` if someone else took it. |
| `POST /api/hermes/runs/:id/finish` `{ "result" }` | Report what you **actually did** (running → done). Shown to Wali on the agent card. |
| `POST /api/hermes/runs/:id/fail` `{ "error" }` | Report why it couldn't be done (running → failed). |
| `POST /api/hermes/agents/:id/avatar` `{ "image_base64", "content_type" }` | Upload an agent's photo (PNG/JPEG/WebP/GIF, max 2 MB); sets `avatar_url`. |

| Resource | Create / update | Filters |
|---|---|---|
| `clients` | name, company, email, phone, country, status, health, program, mrr, owner, next_action, notes, tags, last_contact | status, health, owner, email |
| `tasks` | title, description, status, priority, assignee, client_id, due, tags | status, priority, assignee, client_id |
| `campaigns` | name, channel, status, objective, market, budget, spend, leads, booked, revenue, start_date, end_date, notes | status, channel, market |
| `approvals` | create: type, title, summary, content, requested_by, client_id, thread_id, value, risk (always created `pending`). Update (pending only): title, summary, content, value, risk | status, type, client_id, thread_id, requested_by |
| `threads` | create: contact_name, contact_email, subject, client_id. Update: those + draft | status, client_id, contact_email |
| `agents` | name, role, instructions, scopes (Email/Clients/Tasks/Campaigns/Approvals), avatar_url (https). New agents start **active** with **requires approval** on; only Wali changes those two. | status, name |
| `team` | read only | |
| `runs` | read only (move them with the run actions) | status, agent_id |

Allowed values: client `status` lead/onboarding/active/paused/churned, `health` good/watch/at-risk;
task `status` todo/in-progress/review/done, `priority` urgent/high/medium/low; campaign `channel`
Email/LinkedIn/Meta Ads/Google Ads/Referral/Event/Content/Other, `status` planned/live/paused/completed;
approval `type` Email reply/Proposal/Discount/Refund/Content/Campaign/Other, `risk` low/medium/high.
Dates are `YYYY-MM-DD`, timestamps ISO 8601, ids UUIDs.

Responses are `{ "data": … }`; errors are `{ "error": "…" }` with `400` (bad field or value), `401`
(key), `403` (read only), `404`, `409` (wrong state, e.g. approval already decided).

### Agents: you run them, Wali OS shows them

Agents live in Wali OS (`agents` table) and show on the **Agents** page with their photo. You own their
definitions: create them with `POST /api/hermes/agents`, keep `instructions` current with `PATCH`, and
upload a photo with `/avatar`. Wali controls whether each one is **active** and whether its work
**requires approval**. Check `context.agents` before acting as an agent: skip paused ones.

Chat: `GET /api/agents`, `GET /api/agents/:agent` (id or name, e.g. `coo`) and
`POST /api/agents/:agent/chat` `{ "messages": [{ "role": "user", "content": "…" }] }` answer as that agent
via OpenRouter (`OPENROUTER_API_KEY`, model `AGENT_MODEL`), using its `instructions` from Wali OS plus the
live context. Same `Authorization: Bearer $WALI_OS_API_KEY` (or a signed-in user's Supabase access
token). Only `user`/`assistant` messages are accepted. Wali chats with them from the Agents page.

### Runs: Wali presses Run, you do the work

When Wali presses **Run** on an agent card (optionally with an instruction), a row is queued in
`agent_runs`. Nothing is executed by Wali OS: **you** do the work, with your real tools, as that agent.

1. Poll `GET /api/hermes/runs?status=queued` every 30–60 s (also listed in `context.agent_runs_open`).
   Each run includes `agent` (name, role, instructions, scopes, status, requires_approval).
2. `POST /api/hermes/runs/<id>/start` before working. Skip it if you get `409`.
3. Do the work as that agent, following its `instructions` and the `instruction` on the run
   ("Do your next due task." when Wali left it empty: take the agent's most urgent open task).
   Anything client-facing or costing money → create an approval instead of doing it.
4. `POST /api/hermes/runs/<id>/finish` `{"result": "…"}` with a short, factual account of what you
   did (and any approvals you created), or `/fail` `{"error": "…"}`. Never report work you didn't do.

Wali sees Queued → Running → Done/Failed live on the card, with your result. A queued run can be
cancelled by Wali; `start` then returns `409`.

## 4. What the API won't let Hermes do

- Delete anything.
- Approve or reject an approval, or edit one that's already decided. Only the human does that, in Wali OS.
- Mark an email reply as ready to send, or log a sent reply that wasn't approved.
- Switch an agent on/off or turn off its "requires approval" guardrail (Wali does that in Wali OS).
- Change the team or workspace settings.

## 5. The rules Hermes must follow

Put these in Hermes's system prompt / skill.

1. **Read your playbook first.** Find your entry in `context.agents` by `name`. If `status` is `paused`, do nothing. Follow `instructions`.
2. **Never act externally on your own.** Sending email, offering a discount, issuing a refund, publishing content: propose it as an approval first when `requires_approval` is true.
3. **Propose clearly:** a clear `title`, a one-line `summary`, the exact `content` you'll send or do, an honest `risk`, `value` when money is involved, and `requested_by` = your agent name.
4. **Only carry out `approvals_to_carry_out`.** Use `content` exactly as stored (the human may have edited it), then call `/executed` (or `/sent` for email replies). Read `decision_note` on rejections to learn.
5. **Keep the record honest:** log inbound email, update task status, client `next_action` and `last_contact` as things happen.

## 6. Recipes

```bash
H=(-H "Authorization: Bearer $WALI_OS_API_KEY" -H "Content-Type: application/json")

# New conversation from an incoming email
curl -s "${H[@]}" -X POST "$WALI_OS_URL/api/hermes/threads" \
  -d '{"contact_name":"Sarah Lee","contact_email":"sarah@acme.com","subject":"Pricing question"}'
curl -s "${H[@]}" -X POST "$WALI_OS_URL/api/hermes/threads/<thread id>/inbound" -d '{"body":"<email text>"}'

# Propose a reply (appears in Approvals; thread shows "awaiting approval")
curl -s "${H[@]}" -X POST "$WALI_OS_URL/api/hermes/threads/<thread id>/submit-reply" \
  -d '{"body":"<draft reply>","requested_by":"Operator"}'

# After approval: send the approved content yourself, then
curl -s "${H[@]}" -X POST "$WALI_OS_URL/api/hermes/threads/<thread id>/sent"

# Propose anything else
curl -s "${H[@]}" -X POST "$WALI_OS_URL/api/hermes/approvals" \
  -d '{"type":"Discount","title":"10% off renewal for Acme","content":"…","value":300,"risk":"medium","requested_by":"COO"}'

# Create / update a task
curl -s "${H[@]}" -X POST "$WALI_OS_URL/api/hermes/tasks" \
  -d '{"title":"Prepare onboarding pack","assignee":"Hermes","due":"2026-10-08","priority":"high"}'
curl -s "${H[@]}" -X PATCH "$WALI_OS_URL/api/hermes/tasks/<task id>" -d '{"status":"done"}'

# Create an agent and give it a photo
curl -s "${H[@]}" -X POST "$WALI_OS_URL/api/hermes/agents" \
  -d '{"name":"COO","role":"Strategic oversight, client context, knowledge base","instructions":"…","scopes":["Clients","Tasks","Campaigns","Approvals"]}'
curl -s "${H[@]}" -X POST "$WALI_OS_URL/api/hermes/agents/<agent id>/avatar" \
  -d "{\"content_type\":\"image/png\",\"image_base64\":\"$(base64 -w0 coo.png)\"}"

# Update a client
curl -s "${H[@]}" -X PATCH "$WALI_OS_URL/api/hermes/clients/<client id>" \
  -d '{"health":"watch","next_action":"Call about missed payment"}'
```

If Hermes can't send email itself, skip `/sent`: the thread shows **Approved · send** in Wali OS and
the human sends it with one click.

## 7. Database tables (for reference)

| Table | What it holds |
|---|---|
| `workspace_settings` | Single row: business name, owner, currency, clocks |
| `clients` | Leads and clients |
| `email_threads` / `email_messages` | Conversations and their messages |
| `approvals` | Decisions for the human |
| `tasks` | Work items |
| `campaigns` | Acquisition tracking |
| `agents` | Agent roles & playbooks |
| `team_members` | People to assign work to |
| `activity_log` | Every change, written by database triggers |

Schema: [`supabase/schema.sql`](../supabase/schema.sql). Hermes doesn't need direct database access;
if you ever give it, the service_role key bypasses all security, so treat it like a root password.
