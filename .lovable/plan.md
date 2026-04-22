

# Migrate AI calls from Gemini to Claude (Anthropic)

You've shared an Anthropic API key in chat. **Important: do not paste secrets in chat — they get stored in conversation history. Please rotate this key at console.anthropic.com → API Keys → revoke this one and create a new one.** When implementation starts, I'll request the new key through the secure secret tool (it gets stored as an encrypted env var, never in code or chat).

## What will change

**New secret (requested securely on approval):**
- `ANTHROPIC_API_KEY` — your fresh, rotated key

**Edge functions migrated to Claude Sonnet 4.5:**

| Function | From | To |
|---|---|---|
| `generate-manual-post` | gemini-3-flash-preview | claude-sonnet-4-5 |
| `generate-zoom-post` | gemini-3-flash-preview | claude-sonnet-4-5 |
| `regenerate-caption-only` | gemini-3-flash-preview | claude-sonnet-4-5 |
| `smart-regenerate-image` (vision + prompt builder) | gemini-2.5-flash + gemini-3-flash-preview | claude-sonnet-4-5 |

**Image generation stays on fal.ai Nano Banana** — Claude can't generate images.

## Technical details

Each edge function will be rewritten to use Anthropic's Messages API:

- Endpoint: `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key: $ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- Body shape: top-level `system` field + `messages` array (no system role inside messages)
- Response parsing: `data.content[0].text` instead of `data.choices[0].message.content`
- Vision (Smart Regenerate diagnostic): fetch the existing fal.ai image, base64-encode it, send as `{ type: "image", source: { type: "base64", media_type: "image/png", data } }` block
- Error handling: catch `429` (rate limit), `529` (overloaded), `401` (bad key) and surface friendly toasts to the UI
- Keep the existing 45s timeout wrapper

## Settings page addition

Add an **AI Provider** card to `src/pages/Settings.tsx`:
- Provider: Claude (Anthropic)
- Model: claude-sonnet-4-5
- "Test connection" button → pings Anthropic with a 1-token request
- Connected / Disconnected status badge with error reason

## Files to be edited

- `supabase/functions/generate-manual-post/index.ts`
- `supabase/functions/generate-zoom-post/index.ts`
- `supabase/functions/regenerate-caption-only/index.ts`
- `supabase/functions/smart-regenerate-image/index.ts`
- `src/pages/Settings.tsx` (new AI Provider card)
- `mem://index.md` (note: text = Claude, images = fal.ai)

## Steps on approval

1. **You rotate the leaked key** at console.anthropic.com (revoke the one you pasted, create a new one).
2. I trigger the secure secret prompt for `ANTHROPIC_API_KEY` — paste the new key there.
3. I rewrite the four edge functions and update Settings.
4. Edge functions auto-deploy. Test by generating a post or running Smart Regenerate.

**Billing note:** After this switch, Anthropic bills you directly per token — Lovable AI credits won't be used for these flows anymore. Image generation continues to use your fal.ai key.

