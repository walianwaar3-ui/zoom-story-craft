---
name: AI provider — Claude direct
description: All text and vision LLM calls must use Anthropic Claude direct API, not Lovable AI Gateway
type: constraint
---
All edge functions that need text generation or image vision analysis must call Anthropic's Messages API directly:
- Endpoint: `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key: $ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`
- Model: `claude-sonnet-4-5`
- System prompt goes in top-level `system` field, not in messages array
- Response parsed from `data.content[0].text` (filter blocks where type==="text")
- Vision: send image as `{ type: "image", source: { type: "base64", media_type, data } }` content block — fetch image URL and base64-encode it server-side
- Handle 429 (rate limit), 529 (overloaded), 401 (bad key) with friendly error toasts

**Why:** User explicitly chose Claude over Gemini for quality. Lovable AI Gateway does NOT support Anthropic models, so we bypass it entirely for LLM calls. Image generation still uses fal.ai (Claude can't generate images).

**Functions affected:** generate-manual-post, generate-zoom-post, regenerate-caption-only, smart-regenerate-image, test-anthropic.
