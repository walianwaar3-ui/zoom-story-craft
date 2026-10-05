# Wali OS

Internal operating dashboard for a global growth-consulting business: clients, WhatsApp conversations, campaigns, delivery, approvals and AI agents in one place.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui (Radix) · Recharts · TypeScript

## Modules

| Route | Module | What it does |
|---|---|---|
| `/` | Dashboard | MRR trend, pipeline conversion, approvals waiting, priority tasks, agent activity, at-risk accounts, unread WhatsApp |
| `/clients` | Clients | Filterable/sortable client table (status, region, MRR, health) with a profile drawer (`?client=<id>`) |
| `/inbox` | WhatsApp Inbox | Three-pane inbox: threads, conversation (send, AI-suggested replies, AI take-over toggle), client context |
| `/campaigns` | Campaigns | Spend → leads → booked calls → revenue, per campaign and per channel |
| `/tasks` | Tasks | Drag-and-drop kanban + list view, filter by teammate, new-task dialog |
| `/approvals` | Approvals | Human-in-the-loop queue: edit, approve or reject agent and team requests, with undo |
| `/agents` | Agents | AI workforce: status, run metrics, pause/resume, approval guardrails, activity log |
| `/settings` | Settings | Workspace, integrations (GoHighLevel, WhatsApp API, Meta, Stripe…), team, notifications |

Global: collapsible sidebar (`⌘/Ctrl+B`), command palette (`⌘/Ctrl+K`), live world clocks for client time zones, light/dark/system theme, fully responsive.

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
    data/                 # typed mock data, the only thing to swap for real APIs
    format.ts, utils.ts
```

All data currently comes from `src/lib/data/*`. Every type lives in `src/lib/data/types.ts`. Replacing mocks with GoHighLevel, WhatsApp Cloud API, Stripe or a database means changing what those modules return. The UI doesn't change.

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

### 3. Lock it down before real data goes in

This is an internal tool. Search indexing is already disabled (`robots: noindex`), but **anyone with the URL can open it today**. Before connecting real client data:

- **Fast:** turn on Vercel **Deployment Protection** (Settings → Deployment Protection).
- **Proper:** add authentication (Clerk, Auth.js or Supabase Auth) with a Next.js `proxy.ts` (Next 16's replacement for `middleware.ts`) that redirects signed-out users and restricts sign-in to your team's emails.

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

## Roadmap: from mock UI to a live operating system

1. **Foundation (this release):** production UI, every module, mocked typed data.
2. **Auth + database:** sign-in for the team, Postgres (Supabase/Neon) holding clients, tasks and approvals.
3. **Integrations:** GoHighLevel API (contacts, pipelines, calendars), WhatsApp Cloud API webhooks → Inbox, Meta Ads insights → Campaigns, Stripe → MRR.
4. **Agents:** run agents on the Claude API, with every outbound action routed through **Approvals** under the guardrails configured on the Agents page.
