

# Plan: Connect Fathom Webhooks with Full Transcript Data

## Problem
The webhook configured in Fathom Settings UI only sends empty pings. Fathom's API allows creating webhooks that include transcript, summary, and action items directly in the payload.

## Solution (2 steps)

### Step 1: Store Fathom secrets
Save the two secrets you provided:
- `FATHOM_API_KEY` — your Fathom API key
- `FATHOM_WEBHOOK_SECRET` — for verifying webhook signatures

### Step 2: Create a setup edge function to register the webhook via Fathom API
Create a one-time-use edge function (`setup-fathom-webhook`) that calls the Fathom API to register the webhook properly:

```
POST https://api.fathom.ai/external/v1/webhooks
{
  "destination_url": "https://lrorucjugglumkrxmibt.supabase.co/functions/v1/zoom-webhook",
  "include_transcript": true,
  "include_summary": true,
  "include_action_items": true,
  "triggered_for": ["my_recordings"]
}
```

This replaces the manually-configured webhook. The API-created webhook sends the full payload including transcript, summary, calendar invitees, etc.

### Step 3: Update `zoom-webhook` edge function
Rewrite the webhook handler to:
1. **Verify the webhook signature** using `FATHOM_WEBHOOK_SECRET` (HMAC-SHA256)
2. **Parse the Fathom payload format** directly — the data comes at the top level with fields like `title`, `meeting_title`, `transcript` (array of speaker/text objects), `default_summary`, `calendar_invitees`, `recorded_by`, `share_url`
3. **Convert transcript array to plaintext** — join speaker segments into readable text
4. **Extract client name** from `calendar_invitees` (first external invitee)
5. **Extract summary** from `default_summary.markdown_formatted`
6. **Store in `zoom_transcripts`** table as before

### Step 4: Clean up empty entries
Delete the existing "Untitled Meeting" entries with empty transcripts from the database.

## Technical Details
- Fathom webhook payload includes: `title`, `meeting_title`, `url`, `share_url`, `transcript[]`, `default_summary`, `action_items[]`, `calendar_invitees[]`, `recorded_by`
- Webhook signature verification uses HMAC-SHA256 with the `whsec_` secret
- No Zapier needed — direct Fathom-to-app integration

