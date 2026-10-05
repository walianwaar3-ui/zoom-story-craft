# Wali OS

Internal operating dashboard for a global growth-consulting business: clients, email, campaigns, delivery, approvals and agent playbooks in one place.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui (Radix) · TypeScript

**No AI and no third-party services.** Everything runs in the browser. There is no backend, no database service, no email provider and no AI model.

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

### Where the data lives

All data is stored in the browser's `localStorage` on the device you use. That means:

- Nothing leaves your device, and other visitors to the URL see their own empty workspace.
- Clearing site data or switching browsers or devices starts empty. **Download a backup regularly** (Settings → Data & backup) and restore it to move between devices.
- Multiple tabs in the same browser stay in sync.

To move to shared, multi-device storage later, replace `src/lib/store.tsx` with a database-backed version. The pages only use the store's API.

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
    store.tsx             # local persistence (localStorage), CRUD, backup format
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

This is an internal tool. Search indexing is already disabled (`robots: noindex`). Anyone with the URL can open the app, but your data stays only in your browser, so they see an empty workspace. If you move data to a shared database later, add protection first:

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

## Roadmap

1. **Now:** fully usable, single-user, browser-stored. No integrations.
2. **Shared storage + login:** a database (e.g. Postgres) and sign-in so the team shares one workspace across devices.
3. **Email connection:** pull incoming email and send approved replies directly, instead of copying them across by hand.
4. **AI agents (optional):** the definitions on the Agents page become instructions, with every output still routed through Approvals.
