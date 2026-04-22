

# Plan: Stop real client names from leaking into posts

## What broke

Last post said *"I was on a call with **Bilal** yesterday and he said…"* and mentioned **GoHighLevel** by name. Both should have been generic ("a founder", "their CRM" or an archetype label like "high-level strategic operator").

## Root cause (instructional + plumbing, not AI)

| # | Cause | Layer |
|---|---|---|
| 1 | Prompt sends `Client: Bilal` as a labeled field — Claude reads that as a name it's allowed to use | Code |
| 2 | `OUTPUT_RULES_BLOCK` bans certain words but never bans real names or specific brand/tool names | Prompt |
| 3 | Caption KB describes voice ("operator-to-operator") but never says "swap names for archetypes" | KB content (out of scope — fix in code) |

Same family of bug as the last fix: the model wasn't given a hard rule, and we handed it the raw name on a silver platter.

## The fix (3 layers — mirrors the last fix's pattern)

### Layer 1 — Sanitize the client name before it ever reaches Claude

In all three generation functions (`generate-zoom-post`, `generate-manual-post`, `regenerate-caption-only`):

- Stop sending `Client: <real name>` to the LLM.
- Instead, derive an **archetype label** from the transcript metadata and send that:
  - Build a small `deriveArchetype(transcript)` helper that picks a label based on `meeting_topic` / `issues_discussed` / `summary` keywords.
  - Default labels: `high-level strategic operator`, `agency founder`, `coach scaling delivery`, `service provider`, `SaaS founder`, `consultant`. Falls back to `founder` if nothing matches.
- The prompt now reads:  
  `Client archetype: high-level strategic operator` instead of `Client: Bilal`.
- Keep the real name only in DB metadata (for the user's own reference) — never in the LLM context.

### Layer 2 — Add anonymization rules to `OUTPUT_RULES_BLOCK`

Append two new rules to the existing block (already injected on every call):

```
- NEVER use real first or last names of clients, team members, or anyone
  mentioned in the transcript. Refer to them as "a founder", "an operator",
  "a coach", or use the archetype label provided.
- NEVER name specific third-party tools/brands (GoHighLevel, ClickFunnels,
  Kajabi, Zapier, etc.). Use generic terms: "their CRM", "their funnel
  builder", "their automation stack".
- The post must read as a universal lesson — anyone could be the subject.
```

### Layer 3 — Post-generation name & brand audit (mirrors the banned-word audit)

Extend the existing `auditAndRewrite()` helper to also detect:

- **Names**: scan for `transcript.client_name` and any capitalized two-word sequence in the caption that isn't a sentence start, brand asset (Wali, Wali Digital), or in an allowlist.
- **Tool names**: maintain a small list (`GoHighLevel`, `ClickFunnels`, `Kajabi`, `HubSpot`, `Zapier`, `ActiveCampaign`, `Calendly`, `ManyChat`) and flag any match.

If any are found → one Claude rewrite call: *"Rewrite this post replacing [name] with 'a founder' / [tool] with 'their CRM'. Keep everything else identical."* Same one-shot bound, same logging pattern as the existing audit.

## Files changed

| File | Change |
|---|---|
| `supabase/functions/generate-zoom-post/index.ts` | Add `deriveArchetype()`, swap `Client:` for `Client archetype:`, extend `OUTPUT_RULES_BLOCK`, extend `auditAndRewrite()` |
| `supabase/functions/generate-manual-post/index.ts` | Same `OUTPUT_RULES_BLOCK` + audit changes (no `client_name` field, but still scrub names) |
| `supabase/functions/regenerate-caption-only/index.ts` | Same — also strip name from the "previous caption" passed back in for context |

**No DB changes. No frontend changes. No KB edits. Existing posts untouched** — fix applies only to future generations & regenerations.

## How you'll verify

Generate a fresh batch from the same Zoom transcript that produced the "Bilal" post. Each post should:
- Refer to subject as "a founder" / "an operator" / "a high-level strategic operator" — never by real name
- Replace any specific tool name with a generic equivalent ("their CRM", "their automation stack")
- Still feel grounded in a real moment ("I was on a call this morning with a founder who…")

If a name slips through, the audit layer rewrites it before save.

## What this does NOT change

- The 14-angle pre-planner (variation logic untouched)
- Image generation / fal.ai pipeline
- Any Caption / Brand Pillars / Owner Story KB entries
- Existing posts in the library

