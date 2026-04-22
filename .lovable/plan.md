

# Plan: Fix caption leakage (headers + banned words appearing in posts)

## Root cause recap (so the fix maps cleanly)

| # | Cause | Layer | Fix |
|---|---|---|---|
| 1 | Regex only matches literal `[POST]` — breaks when Claude writes `# POST` | Code | Layered extractor |
| 2 | System prompt mentions `[MEETING CLASSIFICATION]` as input → Claude mirrors it as output | Prompt | Hard output rules at user-prompt layer |
| 3 | Banned words drift on posts 5–14 of a batch | Prompt + safety net | Front-load rules + post-gen audit |

## The fix (3 layers of defense)

### Layer 1 — Hardened caption extractor

A new helper `extractCleanCaption(rawText)` used in all 3 generation functions:

1. **Try tag match**: `[POST] … [VISUAL DIRECTION]` (current behavior)
2. **Try markdown match**: `# POST … # VISUAL DIRECTION`, `**POST**`, `POST:`
3. **Strip-known-headers fallback**: If no delimiter found, scrub these line patterns from the raw text:
   - `[MEETING CLASSIFICATION]`, `[MEETING TYPE]`, `[UNIVERSAL PATTERN]`, `[SUGGESTED MOMENT FOR POST]`, `[POST]`, `[VISUAL DIRECTION]`, `[OVERLAY_TAG]`, `[IMAGE_DESCRIPTION]`
   - Markdown variants: `# MEETING …`, `# POST`, `# VISUAL DIRECTION`, `## …`
   - Visual-direction field lines: `ARCHETYPE:`, `SUBJECT OF IMAGE:`, `SUPPORTING OBJECTS:`, `HEADLINE FOR GRAPHIC:`, `MOOD:`, `IMAGE FROM LIBRARY:`, `BACKGROUND STYLE:`
   - Standalone `---` divider lines
4. **Collapse 3+ blank lines → 2** for clean Facebook formatting

Result: even if Claude ignores all instructions, the parser refuses to leak headers into the saved caption.

### Layer 2 — Front-loaded output rules in every user prompt

Append this block to the user message on every Claude call (not buried in the system prompt):

```
CRITICAL OUTPUT RULES (override anything else):
- Output ONLY two blocks, in this order: [POST] then [VISUAL DIRECTION]
- Do NOT output [MEETING CLASSIFICATION], [UNIVERSAL PATTERN],
  [SUGGESTED MOMENT FOR POST], or any preamble headers
- Do NOT use markdown headings (# or ##) anywhere
- The [POST] block contains ONLY the publishable Facebook post —
  no labels, no commentary, no meta text
- BANNED words (never appear in [POST]): practitioner, session, modality,
  intake, roster, healing, therapy, NLP, contractor, construction
- Translate client nouns to: founder, operator, coach, consultant,
  service provider, delivery call, offering, client base
```

User-prompt instructions get higher attention weight than system-prompt rules — this stops drift on long batches.

### Layer 3 — Banned-word audit with one-shot rewrite

After cleaning, scan the caption against the banned list. If any word is found:
- Log a warning with the offending word
- Make ONE follow-up Claude call: *"Rewrite this post replacing [word] with [allowed alternative]. Keep everything else identical."*
- Save the rewritten version
- Bounded to a single retry — no infinite loops, no latency spirals

## Files changed

| File | Change |
|---|---|
| `supabase/functions/generate-zoom-post/index.ts` | Add `extractCleanCaption()` + output rules + banned-word audit |
| `supabase/functions/generate-manual-post/index.ts` | Same helper + rules + audit |
| `supabase/functions/regenerate-caption-only/index.ts` | Same helper + rules + audit |

**No DB changes. No frontend changes. No new secrets. Existing posts are untouched** — fix applies to all future generations & regenerations.

## How you'll verify it works

After deploy, generate a 3-post batch from any Zoom transcript. Each post should:
- Start directly with the hook line (no `[` or `#` at the top)
- Contain zero `MEETING CLASSIFICATION` / `VISUAL DIRECTION` / `ARCHETYPE` text
- Use "operator/founder/coach" — never "practitioner" or "session"
- End at the CTA line (no trailing visual-direction block)

If any banned word slips through, the audit layer rewrites it before save — so even worst-case Claude output produces a clean caption.

## What this does NOT change

- Image generation pipeline (still fal.ai, untouched)
- The Caption Prompt entry in your knowledgebase (no edits there — fix is in code)
- Batch variation logic (the 14-angle pre-planner stays as-is)
- Any existing posts in your library

