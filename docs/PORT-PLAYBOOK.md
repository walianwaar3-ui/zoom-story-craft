# Port Playbook

**Extraction plan · CSMSYNERGY/csm-studio @ main**

What it takes to stand up a new app holding only three of CSM Studio's features — the meeting-to-post pipeline, the Meta Ads chat agent, and One Reel.

| | |
|---|---|
| Written | 2026-09-13 |
| Source | 61 migrations · 32 edge functions · 19 pages |
| Estimate | 2.5–3.5 weeks, one engineer |

## The three features

**01 · Meeting → Post**
Fathom/Zoom transcript in; brand-voice caption and image out. Backed by the per-user knowledgebase, the AI assistant and Creative Studio.

**02 · Meta Ads**
Per-account System User token, driven by a chat agent that drafts copy and pushes paused campaigns.

**03 · One Reel**
Script generator, raw clip upload, 48-hour human edit, delivered cut — optionally pushed to Meta as a video ad.

---

## 00 · The verdict

This is a subtraction, not a rewrite.

The three features have zero code coupling to what you're leaving behind — CRM, Synergy Chat, GoHighLevel, the Chrome extension, the MCP server. Verified by grepping every in-scope edge function for `crm_`, `ghl`, `synergy_chat` and `pipeline`; the only hits were false positives inside the words "highlights" and "roughly".

You copy about 12,000 lines of edge function, fourteen pages, and a rebuilt schema. You do not re-derive the prompt chain — that is the expensive part, and it ports verbatim.

**Not what it looks like — Features 2 and 3 are already one feature.**
`meta-ads-agent` carries two reel tools — `list_reels` and `create_video_ad_from_reel` — and `reel_requests.meta_video_id` exists specifically so a reel push to Meta survives an edge-function timeout without orphaning an uploaded video. You cannot take Meta Ads without One Reel's schema. Treat them as one workstream.

**Not what it looks like — "Meeting into post" is a spine, not a function.**
Nothing generates until `onboarding_progress` → `install-knowledgebase` → `knowledgebase` has run for that user. Skip the onboarding wizard and every generator returns 400, forever. The wizard is not polish you defer — it is the feature's input.

---

## 01 · The dependency spine

What you cannot skip:

```
auth.users → onboarding_progress
  6 required fields: brand_name, founder_name, brand_story, niche,
  target_audience_description, offer
  → 400s if incomplete

install-knowledgebase
  substitutes {{BRAND_NAME}}, {{CORE_OFFER_NAME}}, {{BRAND_VOICE_KEYWORDS}}…
  into two master prompts

knowledgebase (per user)
  the user's own editable copy — loadPromptOrMaster() prefers it,
  falls back to prompt_templates

generate-zoom-post · generate-manual-post · regenerate-post → generated_content
```

`prompt_templates` holds two consolidated master prompts keyed `brand_caption` and `image_generation` — the seven-key system was retired in migration `20260719120000`. These rows are seed data you must carry over: they are the product. An empty table means `Master prompt 'brand_caption' is not seeded` on every single generation.

### Three gates sit in front of every generation

| Gate | Lives in | Applies to |
|---|---|---|
| `check_and_increment_image_quota()` | Database, service-role only | every image generation |
| `checkFeature(admin, uid, …)` | `_shared/entitlement.ts` | `meta-ads-agent`, `meta-connect`, `reel-script` |
| `entitlementUsable()` | `src/hooks/useBilling.ts` | the React padlocks |

The last two are deliberate mirrors of each other. Change one without the other and a customer gets an unlocked button that 403s — which reads as a broken app, not a paywall.

### So you cannot simply delete billing

Those gates read `user_subscriptions` and `subscription_plans.features`. Pick one path before you reach phase 7:

**(a) Keep the skeleton, drop the gateway — Recommended**
Port `user_subscriptions`, `subscription_plans`, `admin_plan_grants`, `usage_counters`, `sync_user_entitlement()`, `set_plan_grant()`. Drop `csm-billing`, its webhook, the `billing_*` tables and NMI entirely. Every user gets a grant row. About one migration of work, and `checkFeature` plus the quota RPC keep working untouched.

**(b) Stub it**
Rewrite `checkFeature` to always return `allowed: true` and make the quota RPC always pass. Roughly two hours — but you lose the usage counter, and you will rebuild this the first time someone's Anthropic bill spikes with nothing to attribute it to.

---

## 02 · Manifest — exactly what moves

### Edge functions

`_shared/` is effectively monolithic — copy the whole directory. Trimming its 4,546 lines costs more time than the 60 KB it saves.

| Group | Functions | LOC |
|---|---|---|
| Ingest | `zoom-webhook` · `fathom-pull-latest` · `fathom-verify` | 685 |
| Generation | `generate-zoom-post` · `generate-manual-post` · `generate-raw-post` · `regenerate-post` · `onboarding-first-image` · `fal-image-webhook` | 2,284 |
| KB / assistant | `install-knowledgebase` · `kb-assistant` · `push-prompts-to-all` | 1,021 |
| Creative / brand | `creative-studio` · `apply-logo-overlay` · `extract-brand-colors` · `import-brand-from-website` | 1,404 |
| Meta Ads | `meta-connect` · `meta-ads-agent` | 1,398 |
| One Reel | `reel-script` | 197 |
| Support | `niche-trends` · `verify-api-key` | 431 |
| Shared | `_shared/*` — 22 files, copy wholesale | 4,546 |
| **22 functions kept** | | **11,966** |

**Drop — 10 functions · 2,950 LOC**

| Function | LOC |
|---|---|
| `crm-extension` | 549 |
| `csm-billing` | 450 |
| `csm-billing-webhook` | 404 |
| `mcp-server` | 377 |
| `admin-user-actions` | 330 |
| `extension-pair` | 328 |
| `ghl-social` | 171 |
| `admin-impersonate` | 137 |
| `submit-feedback` | 106 |
| `purchase-webhook` | 98 |

Keep `admin-user-actions` if you want the admin roster — it's independent of all three features.

### Pages — 14 pages · ~4,930 LOC

| Page | LOC | Page | LOC |
|---|---|---|---|
| GeneratedPosts | 870 | Onboarding | 758 |
| AdminPrompts | 616 | Settings | 525 |
| AdminUsers | 520 | GeneratePost | 433 |
| AdminReels | 311 | Index | 236 |
| SignUp | 170 | Brand | 140 |
| Auth | 136 | ResetPassword | 115 |
| MetaAds | 74 | NotFound | 29 |

Drop `SynergyChat`, `Activity`, and — under option (a) only — `AdminSubscribers`, `AdminPlans`, `ChoosePlan`.

### Database — rebuild, don't replay

The 61 existing migrations (5,060 lines) include retired systems, a Lovable-era archive and two schema reversals. Write one fresh consolidated baseline. Tables in scope:

| Group | Tables |
|---|---|
| Spine | `profiles` · `user_roles` · `onboarding_progress` · `knowledgebase` · `prompt_templates` · `admin_settings` · `error_log` · `user_api_keys` |
| Content | `zoom_transcripts` · `generated_content` · `content_publications` · `user_headshots` |
| Creative | `creative_styles` · `user_style_preferences` · `account_visual_profiles` |
| Meta | `meta_connections` · `meta_ad_drafts` |
| Reel | `reel_requests` |
| Entitlement (a) | `subscription_plans` · `user_subscriptions` · `admin_plan_grants` · `usage_counters` |

Drop: all 11 `crm_*` tables, 3 `extension_*`, 3 `billing_*`, plus `mcp_tokens`, `allowed_signups`, `niche_defaults`, `brand_guideline_templates`, `admin_impersonation_log`.

Also carry: enums `app_role`, `zoom_transcript_status`, `aspect_ratio`; buckets `headshots`, `creative-studio-refs`, and `reels` (private, 500 MB cap, video MIME allowlist).

Read these five migrations before you rewrite them. They carry the security reasoning in their comments, and the reasoning is the part worth keeping:

- `20260518140431` — baseline DDL + RLS
- `20260710120000` — Creative Studio isolation contract
- `20260829120000` — the Meta token model
- `20260911120000` — One Reel storage + SECURITY DEFINER transitions
- `20260825121000` — quota v2

`src/integrations/supabase/types.ts` (2,356 lines) is generated — do not copy it. Regenerate once the new schema lands. The shadcn `components/ui/` kit (32 files, 2,424 LOC) copies wholesale.

---

## 03 · Accounts and secrets

| What | Where it lives | Notes |
|---|---|---|
| Anthropic key | `admin_settings.anthropic_api_key` | Not `.env`. Model in use is `claude-sonnet-4-5`, at four call sites |
| FAL key | `admin_settings.fal_key` | Image generation and `fal-image-webhook` |
| Perplexity key | `admin_settings.perplexity_api_key` | `niche-trends` only — droppable |
| Fathom key + secret | `user_api_keys` | Per user, not global |
| Meta token | `meta_connections.access_token` | Per account; RLS denies the browser outright |
| Supabase URL / anon | `.env` as `VITE_*` | Baked in at build time |

The Meta setup step customers get wrong. A new Meta app starts in Development mode and silently cannot create ad creatives — error 100, subcode 1885183. `metaHint()` in `_shared/meta.ts` explains it and the connect card makes it step three. Build that into your UI too.

A System User token needs no App Review, because it only touches the business's own assets. That is the entire reason self-connect works at all. Don't "upgrade" to OAuth unless you're ready for `ads_management` review.

---

## 04 · Rebuild sequence

Each phase independently testable. Do it in this order. Skipping ahead means debugging two layers at once.

**1 — Spine, no features yet**
New Supabase project. Baseline migration: enums, `profiles`, `user_roles`, the `handle_new_user` trigger, `error_log` + RLS, `admin_settings`, `onboarding_progress`. Vite + React + router + the shadcn kit + `useAuth` + `RequireAuth`.
> Gate: Sign up, land on onboarding, and a deliberately thrown test error appears in `error_log`.

**2 — Prompts and knowledgebase**
`prompt_templates` with both master prompts seeded, `knowledgebase`, `install-knowledgebase`, the onboarding wizard, `/admin/prompts`.
> Gate: Complete onboarding and two rows appear in `knowledgebase` with every placeholder substituted.

**3 — Generation**
`generated_content`, `user_headshots`, the quota RPC, storage buckets. Functions: `generate-manual-post`, `generate-raw-post`, `fal-image-webhook`, `onboarding-first-image`. Pages: GeneratePost (manual tab), GeneratedPosts.
> Gate: A manual post produces caption and image end to end.

**4 — Meeting → Post**
`zoom_transcripts`, `user_api_keys`, `zoom-webhook`, `fathom-pull-latest`, `fathom-verify`, `generate-zoom-post`, `regenerate-post`, and the MeetingTranscriptsPanel.
> Gate: A real Fathom webhook creates a transcript row, and that row converts to a post.

**5 — Brand, Creative Studio, assistant**
`account_visual_profiles`, `creative_styles`, `user_style_preferences`. Functions: `creative-studio`, `kb-assistant`, `extract-brand-colors`, `import-brand-from-website`, `apply-logo-overlay`. The Brand page and its 17 components — the largest UI surface in the port.
> Gate: An active visual profile visibly changes image output.

**6 — Entitlement (do this before phase 7)**
Option (a) or (b) from section 01. `meta-connect`, `meta-ads-agent` and `reel-script` all call `checkFeature` on line one; arriving at phase 7 without this decision made is how you end up stubbing it badly under time pressure.
> Gate: A user with no grant is denied; a user with one passes.

**7 — Meta Ads and One Reel, together**
`meta_connections`, `meta_ad_drafts`, `reel_requests`, the `reels` bucket and the three SECURITY DEFINER RPCs. Functions: `meta-connect`, `meta-ads-agent`, `reel-script`. Pages: MetaAds, OneReelPanel, AdminReels.
> Gate: Connect a real ad account, push one paused image ad, submit one reel and deliver it as an admin.

**8 — Ship**
Cloudflare Worker — `wrangler.jsonc` ports as-is, change name and `account_id`. Then `public/_headers` and the Supabase redirect allow-list.
> Gate: Live bundle hash matches a local build.

---

## 05 · Traps — these already cost us time

### Deploys

A green push does not mean code is live. A repo rename left the host's Git link dangling; production sat four days stale while every PR looked merged. Verify the live bundle hash against a local build every time:

```
curl -s https://<host>/ | grep -oE 'assets/index-[^"]+\.js'
ls dist/assets/index-*.js
```

Edge functions do not deploy on git push. The host builds the frontend only. Run `supabase functions deploy` yourself after every change under `supabase/functions/`.

`npx tsc --noEmit` typechecks zero files here. The root tsconfig is a solution file — `"files": []` plus project references — so it always "passes". Use `tsc -b --force`. This silently hid two real type errors for weeks.

If the app renders in an iframe, `frame-ancestors` is load-bearing. A wrong value means a blank page inside the frame and a perfect page in a direct tab. `curl` cannot catch it — open the real embed.

### Database

Never create a SQL file marked "apply manually." A `get_admin_settings_status` file went to `supabase/sql/` instead of `supabase/migrations/`, never got applied, and broke the admin page for an hour. Migrations only, always idempotent.

A migration creating an RPC ships in the same commit as the page that calls it — or earlier. Never lag.

Wrap `auth.uid()` as `(select auth.uid())` in every RLS policy, or you take the `auth_rls_initplan` performance lint on every table.

### Security — carry these over intact

`meta_connections` has RLS on with no policy for `authenticated`. That is not an oversight — an `ads_management` token spends money. Do not add a "users can read their own connection" policy. Status comes from `get_meta_connection_status()`, which returns labels and never the secret.

`creative_styles` revokes SELECT from `authenticated` and re-grants named columns, because `prompt_template` and `extraction_schema` are prompt-engine internals. `select('*')` from the browser is rejected by design.

The agent keys every query on `user.id` from the verified JWT — never from the request body, never from a model-supplied value. `create_ad_from_post` filters `generated_content` by `user_id AND id`, which is what stops the agent being talked into another account's post. Keep that when you add tools.

Everything the agent creates is PAUSED. The create helpers hard-code it, the model is never given a status argument, and there is no activate tool. Objectives are clamped to traffic/engagement/awareness; budget to $5–500 a day. Activation is a human action in Ads Manager. Do not "improve" this.

One Reel's `due_at` is written only by `submit_reel_request()`, a SECURITY DEFINER function, so a browser cannot shorten its own deadline. Same reason claim and deliver are RPCs rather than table writes.

### Error handling

Every error must reach `error_log`. Edge functions call `errorResponse(FN, stage, msg, status, …)`; a bare `return new Response(JSON.stringify({error}))` silently misses the table. The frontend calls `logClientError`. Toast-only handling is forbidden — log and toast.

---

## 06 · The non-code dependency

One Reel is a service, not a feature.

Each request consumes real editing hours from a human, against a 48-hour promise. It ships uncapped on every plan in the source app, and the queue exists so that volume stays visible — but the new app needs an actual editor rota before launch, or `reel_requests` becomes a list of missed deadlines with a countdown timer attached.

The cap is a one-line change — `features.one_reel` becomes a count. The staffing is not.

---

## 07 · Effort

| Phase | Nature | Estimate |
|---|---|---|
| 1–2 · Spine + prompts | Mostly copy; schema rewrite | 2–3 d |
| 3–4 · Generation + ingest | Copy, plus real webhook testing | 3–4 d |
| 5 · Brand / Creative Studio | Largest UI surface — 17 components | 3–4 d |
| 6 · Entitlement | Option (a) ~1 d · option (b) ~2 h | 0.5–1 d |
| 7 · Meta + Reel | Copy, plus a live ad account and storage | 3–4 d |
| 8 · Deploy, DNS, soak | — | 1–2 d |
| **One engineer, to a working tested deployment** | | **2.5–3.5 wk** |

The risk is not the code — it ports cleanly. It is the live integrations: a real Fathom webhook, a real Meta app out of Development mode, and a real 500 MB video moving through storage into `/advideos`. Budget your contingency there, not in the copying.

---

*Figures measured against `main` @ 2026-09-13.*
