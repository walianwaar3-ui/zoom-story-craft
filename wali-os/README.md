# Wali OS

Internal operating dashboard for a global growth-consulting business: clients, email, campaigns, delivery, approvals and agent playbooks in one place.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui (Radix) · TypeScript

**Two ways to run:**
- **Cloud (recommended):** Supabase stores the data, you sign in, everything syncs live across devices and with your **Hermes** backend agent. See [Connect Supabase](#connect-supabase) and [`docs/HERMES.md`](docs/HERMES.md).
- **Browser-only:** with no Supabase settings, data stays in the browser you use. No accounts or services needed.

## Modules

| Route | Module | What it does |
|---|---|---|
| `/` | Dashboard | Live counts from your data: revenue, clients, emails to handle, pending approvals, upcoming tasks, pipeline by status, setup checklist |
| `/clients` | Clients | Leads and clients with status, health, monthly revenue, next action, notes and tags. Profile drawer shows linked emails and tasks |
| `/inbox` | Email Inbox | Log emails you receive, draft replies, submit them for approval, then send through your own email app |
| `/campaigns` | Campaigns | Track any acquisition effort and update spend, leads, booked calls and revenue by hand |
| `/tasks` | Tasks | Drag-and-drop kanban plus list view, assignees, due dates, client links |
| `/approvals` | Approvals | Approve, edit or reject email replies and any request you log (proposals, discounts, refunds, content) |
| `/agents` | Agents | Role definitions: playbook, scope and approval guardrail. Ready to become real agents if an AI model is connected later |
| `/settings` | Settings | Your profile and business, currency, client time zones, team list, backup / restore / erase |

### Email reply flow

1. **Log email**: paste an email you received. It links to the matching client automatically by address.
2. **Draft and submit for approval**: drafts save as you type.
3. **Approve** (optionally edit first) or **Reject**. A rejected reply goes back to the inbox as an editable draft.
4. **Open in email app** fills in a reply (to, subject, body) in your own mail program. Send it there, then click **Mark as sent**.

### Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It creates the tables, row-level security (signed-in users only) and realtime. Safe to re-run.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up". Then **Authentication → Users → Add user** to create your login (tick auto-confirm).
4. In Vercel (**Project → Settings → Environment Variables**) add:
   - `NEXT_PUBLIC_SUPABASE_URL`: Supabase → Project Settings → API → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the **anon / publishable** key (never the service_role key)
5. Redeploy. The app now asks you to sign in. If you used the browser-only version first, go to **Settings → Data & backup → Copy to cloud** to bring that data across.

Hermes connects to the same database with the service_role key on its own server. Follow [`docs/HERMES.md`](docs/HERMES.md).

### Where the data lives

- **Cloud mode:** in your Supabase Postgres database. Only signed-in users can read or write it (row-level security). Changes from other devices or Hermes appear live.
- **Browser-only mode:** in this browser's `localStorage`. Other visitors see their own empty workspace. Clearing site data loses it, so **download a backup regularly** (Settings → Data & backup).

## Run locally

```bash
cd wali-os
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run build      # production build check
```

## Project structure

```
src/
  app/
    layout.tsx            # fonts, theme, toaster
    (os)/layout.tsx       # sidebar + topbar shell
    (os)/<module>/page.tsx
  components/
    ui/                   # shadcn/ui primitives
    layout/               # sidebar, topbar, command menu, nav config
    shared/               # status badges, stat cards
    <module>/             # one folder per module
  lib/
    data/types.ts         # the data model
    store.tsx             # state, auth, local or cloud persistence
    supabase.ts           # Supabase client (enabled by env vars)
    sync/                 # row mappers + diff/realtime sync engine
    workflows.ts          # email ↔ approval lifecycle rules
    format.ts, utils.ts
```

---

## Hosting and domain plan

### 1. Deploy on Vercel (recommended, free tier is enough to start)

Vercel builds Next.js natively. Nothing extra to configure.

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import this repository.
2. **Root Directory:** set it to `wali-os` (this app lives in a subfolder of the repo).
3. Framework preset: **Next.js** (auto-detected). Leave the build command as the default.
4. Deploy. You get a production URL like `https://wali-os.vercel.app` (or `<project-name>.vercel.app`) straight away, plus a preview URL for every pull request.

### 2. Point your own domain at it

In Vercel go to **Project → Settings → Domains → Add**, then add the DNS record Vercel shows you at your registrar (GoDaddy, Namecheap, Cloudflare…):

| You want | Record | Name | Value |
|---|---|---|---|
| `os.yourdomain.com` (recommended) | CNAME | `os` | the CNAME Vercel shows (typically `cname.vercel-dns.com`) |
| `yourdomain.com` (apex) | A | `@` | the IP Vercel shows (typically `76.76.21.21`) |

HTTPS certificates are issued automatically. A subdomain like `os.` keeps the internal OS separate from your public marketing site.

### 3. Access and privacy

Search indexing is disabled (`robots: noindex`). With Supabase connected, the app requires sign-in and the database refuses anyone who isn't signed in (row-level security), so the public URL exposes no data. Keep public sign-ups **off** in Supabase so only users you create can log in. Never put the service_role key in Vercel or the browser. It belongs only on the Hermes server.

### Alternatives

- **Netlify**, **Cloudflare Pages** (via OpenNext) and **Railway** all work too. Set the base directory to `wali-os`.
- **Self-host** with `npm run build && npm start` behind Nginx/Caddy on any VPS.

### Optional: give Wali OS its own repository

The app is fully self-contained in `wali-os/`. To split it into its own repo with history:

```bash
git subtree split --prefix=wali-os -b wali-os-only
git push git@github.com:<you>/wali-os.git wali-os-only:main
```

Then import that new repo in Vercel and leave Root Directory empty.

---

## Roadmap

1. **Done:** fully usable app, Supabase storage with login and live sync, Hermes contract (`docs/HERMES.md`).
2. **Hermes operating:** Hermes logs inbound email, proposes replies and actions through Approvals, executes approved items.
3. **Email sending from Hermes:** approved replies sent automatically instead of through your email app.
