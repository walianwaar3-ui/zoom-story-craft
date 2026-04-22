# Project Memory

## Core
Zoom transcript → social post generator for Carolyn Miller (construction sales).
Clean & professional design. No auth — single user, public access by design.
Text/vision = Claude (Anthropic, claude-sonnet-4-5, direct API via ANTHROPIC_API_KEY). Images = fal.ai Nano Banana. Lovable Cloud backend.

## Memories
- [Content & Image Prompt SOP](mem://features/content-prompt-sop) — Full prompt system for generating posts and image prompts from transcripts: voice rules, campaign structure, visual SOP, engagement strategy
- [Image gen constraint](mem://constraints/image-gen-fal-only) — Never use Lovable AI for image generation, always use fal.ai
- [AI provider](mem://constraints/ai-provider-claude) — All text generation and vision diagnostic calls must use Anthropic Claude direct API (claude-sonnet-4-5), NOT Lovable AI Gateway
