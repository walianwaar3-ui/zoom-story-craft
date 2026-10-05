# Connecting Hermes to Wali OS

Wali OS is the face; Supabase is the shared memory; Hermes is the operator.

```
Hermes (your server) ──service_role key──▶ Supabase ◀──signed-in user + live sync── Wali OS (browser)
```

Hermes never talks to the Wali OS website and does **not** need to be exposed to the internet. Keep the Hermes API gateway bound to `127.0.0.1` (or behind a firewall / HTTPS proxy) — Wali OS doesn't call it.

## 1. Credentials for Hermes

Put these in Hermes's environment (e.g. `~/.hermes/.env`), **never** in Wali OS or any browser code:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Supabase → Project Settings → API → service_role / secret key>
```

The service role key bypasses Row Level Security — treat it like a root password. `chmod 600 ~/.hermes/.env`. If it ever leaks, rotate it in Supabase.

## 2. Talking to the database

Any HTTP client works (Supabase's REST API). Every request sends both headers:

```
apikey: $SUPABASE_SERVICE_ROLE_KEY
Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY
```

Python (`pip install supabase`):

```python
import os
from supabase import create_client
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
sb.table("approvals").select("*").eq("status", "approved").is_("executed_at", "null").execute()
```

curl:

```bash
curl "$SUPABASE_URL/rest/v1/approvals?status=eq.approved&executed_at=is.null" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Anything Hermes writes appears in the open Wali OS app within a second (Supabase Realtime).

## 3. Tables

| Table | What it holds | Key columns |
|---|---|---|
| `workspace_settings` | Single row (`id = 1`) | `business_name`, `owner_name`, `owner_email`, `currency`, `clocks` |
| `clients` | Leads and clients | `name`, `email`, `status` (lead/onboarding/active/paused/churned), `health` (good/watch/at-risk), `mrr`, `next_action`, `notes`, `tags[]`, `last_contact` |
| `email_threads` | One conversation | `contact_name`, `contact_email`, `subject`, `client_id`, `status` (needs-reply/awaiting-approval/ready-to-send/replied/closed), `draft`, `approval_id`, `updated_at` |
| `email_messages` | Messages in a thread | `thread_id`, `direction` (in/out), `body`, `at` |
| `approvals` | Decisions for the human | `type` (Email reply/Proposal/Discount/Refund/Content/Campaign/Other), `title`, `summary`, `content`, `requested_by`, `client_id`, `thread_id`, `value`, `risk` (low/medium/high), `status` (pending/approved/rejected), `decided_at`, `decision_note`, `executed_at` |
| `tasks` | Work items | `title`, `description`, `status` (todo/in-progress/review/done), `priority` (urgent/high/medium/low), `assignee`, `client_id`, `due` (date), `tags[]` |
| `campaigns` | Acquisition tracking | `name`, `channel`, `status` (planned/live/paused/completed), `budget`, `spend`, `leads`, `booked`, `revenue`, `start_date`, `end_date` |
| `agents` | Agent roles & playbooks | `name`, `role`, `instructions`, `scopes[]`, `status` (active/paused), `requires_approval` |
| `team_members` | People to assign work to | `name`, `email`, `role` |

Ids are UUIDs and default to `gen_random_uuid()`, so Hermes can omit them on insert.

## 4. The rules Hermes must follow

These keep you in control. Put them in Hermes's system prompt / skill.

1. **Read your playbook first.** Load your row from `agents` (by `name`). If `status = 'paused'`, do nothing. Follow `instructions`.
2. **Never act externally on your own.** Sending an email, offering a discount, issuing a refund, publishing content — all of it goes through `approvals` first when `requires_approval` is true.
3. **Propose by inserting an approval** with `status = 'pending'`, `requested_by = '<your agent name>'`, a clear `title`, a one-line `summary`, the exact `content` you intend to send or do, and an honest `risk`.
4. **Only execute approvals with `status = 'approved'` and `executed_at IS NULL`.** Use the `content` as stored — the human may have edited it. After acting, set `executed_at = now()`. Never act on `pending` or `rejected`; read `decision_note` on rejections to learn.
5. **Keep the record honest:** log what happened (messages, task status, client `last_contact`, `next_action`) in the same tables.

## 5. Recipes

**Log an incoming email**

```sql
insert into email_threads (contact_name, contact_email, subject, client_id, status)
values ('Sarah Lee', 'sarah@acme.com', 'Pricing question',
        (select id from clients where lower(email) = 'sarah@acme.com' limit 1), 'needs-reply')
returning id;

insert into email_messages (thread_id, direction, body) values ('<thread id>', 'in', '<email text>');
```

For a reply in an existing conversation, insert only the message and set the thread back to `needs-reply`, `updated_at = now()`.

**Propose an email reply** (two writes)

```sql
insert into approvals (type, title, summary, content, requested_by, client_id, thread_id, risk)
values ('Email reply', 'Reply to Sarah Lee: Pricing question', '<their last message, short>',
        '<your draft reply>', 'Hermes', '<client id or null>', '<thread id>', 'low')
returning id;

update email_threads set status = 'awaiting-approval', approval_id = '<approval id>', draft = '', updated_at = now()
where id = '<thread id>';
```

**After the human approves an email reply** — if Hermes can send email itself:

```sql
-- after sending the approved content
insert into email_messages (thread_id, direction, body) values ('<thread id>', 'out', '<approved content>');
update email_threads set status = 'replied', approval_id = null, updated_at = now() where id = '<thread id>';
update approvals set executed_at = now() where id = '<approval id>';
update clients set last_contact = now() where id = '<client id>';
```

If Hermes can't send email, leave it: the thread shows **Approved · send** in Wali OS and the human sends it with one click.

**Propose anything else** (proposal, discount, refund, content): insert into `approvals` with the matching `type` (and `value` if money is involved). After approval, do it, then set `executed_at`.

**Create a task for the team**

```sql
insert into tasks (title, description, assignee, due, priority, client_id)
values ('Prepare onboarding pack', 'From kickoff call notes', 'Hermes', current_date + 2, 'high', '<client id>');
```

## 6. Reacting instantly instead of polling (optional)

Subscribe to Supabase Realtime on `approvals` and act when a row changes to `status = 'approved'`. Polling every minute with the query in section 2 is simpler and works just as well to start.
