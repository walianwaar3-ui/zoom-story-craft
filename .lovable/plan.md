# Plan: Fine-tune dialog for Zoom transcript posts

## What you'll get

On the **Zoom Transcripts** page, each transcript card will have **two buttons** instead of one:

1. **Quick Generate** — same as today. One click → batch generation runs immediately (1–14 posts, default angles, default style).
2. **Fine-tune** — opens a dialog (same fields as the manual *Generate Post* page) so you can steer exactly what gets produced from this transcript.

The Fine-tune dialog will pre-show the transcript's summary/key issues for context, but **you write the hook yourself** — the AI will not auto-pick it.

## Fine-tune dialog fields

Mirrors the manual Generate Post page:

- **Post Date** (defaults to today)
- **Post Type** (Evergreen / Promo / News Reaction / Personal Story)
- **Hook / Core Insight** *(required, you type it)*
- **Context / Backstory** *(optional — pre-filled with transcript summary + issues, fully editable)*
- **CTA Goal** (Auto / System Map / Funnel / Blueprint / Ladder / Engine / Structure / Stack)
- **Image Style** (Auto / Anchor Shot / Operator Shot / News Report / Versus / Relatable)
- **Aspect Ratio** (1:1 / 9:16 / 16:9 / 4:5)

Above the form: small read-only block showing the transcript's **Summary** and **Key Issues** so you can see what to draw from while writing your hook.

Single-post output (no 1–14 batch in this mode — fine-tune is for one carefully-shaped post). After generation, the existing "Post to GHL" dialog opens, same as Quick Generate's single-post flow.

## Where each button lives

```text
[ Transcript card ]
  ...meeting topic, client, date, summary...
  [ View ]  [ Quick Generate ▾ ]  [ Fine-tune ✎ ]  [ 🗑 ]
```

`Quick Generate` keeps its current sub-dialog (post count 1–14 + aspect ratio).
`Fine-tune` is the new dialog described above.

## Technical notes

**Frontend — `src/pages/ZoomPosts.tsx`**
- Add `fineTuneTranscript` state + dialog component.
- Reuse the field set from `src/pages/GeneratePost.tsx` (extract shared option arrays into a small local consts block, no new shared file needed).
- On submit, call the existing `generate-manual-post` edge function and pass an extra `transcript_id` so the edge function can attach the generated row to the source transcript (and so the AI can use the transcript as additional grounding context).

**Backend — `supabase/functions/generate-manual-post/index.ts`**
- Accept optional `transcript_id` in the request body.
- If present:
  - Load the transcript row (`zoom_transcripts`).
  - Append its `summary` + `issues_discussed` + (truncated) `transcript` to the prompt context as "source call notes" — the user-supplied `hook` and `context` remain the primary signal.
  - Set `generated_content.transcript_id` to the provided id and `source = 'transcript'` (instead of `'manual'`) so the post shows up linked to the transcript in Generated Posts.
- All existing safeguards (no client names, no tool brands, archetype derivation, audit/rewrite layer) continue to apply unchanged.

**No DB migration needed** — `generated_content.transcript_id` already exists.

## Out of scope

- The 14-angle batch planner (Quick Generate path is untouched).
- Manual *Generate Post* page (already supports this flow standalone).
- Any change to image generation (still fal.ai), name-scrubbing, or Generated Posts UI.
