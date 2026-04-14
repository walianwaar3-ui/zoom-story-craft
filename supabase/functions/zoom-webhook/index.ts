import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader || !secret) return true; // Skip if not configured

  try {
    // Fathom sends: "v1,<base64-hmac>"
    const parts = signatureHeader.split(",");
    const sig = parts.length > 1 ? parts[1] : parts[0];

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return sig.trim() === expected.trim();
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}

function transcriptToPlaintext(transcript: any): string {
  if (typeof transcript === "string") return transcript;
  if (Array.isArray(transcript)) {
    return transcript
      .map((seg: any) => {
        const speaker = seg.speaker || seg.name || "Speaker";
        const text = seg.text || seg.content || "";
        return `${speaker}: ${text}`;
      })
      .join("\n");
  }
  if (transcript?.plaintext) return transcript.plaintext;
  return JSON.stringify(transcript);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawText = await req.text();
    console.log("=== WEBHOOK PAYLOAD (first 1000 chars) ===");
    console.log(rawText.slice(0, 1000));

    // Verify webhook signature
    const webhookSecret = Deno.env.get("FATHOM_WEBHOOK_SECRET") || "";
    const signatureHeader = req.headers.get("x-fathom-signature") || req.headers.get("x-webhook-signature");
    
    if (webhookSecret && signatureHeader) {
      const valid = await verifySignature(rawText, signatureHeader, webhookSecret);
      if (!valid) {
        console.error("Invalid webhook signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let body: any;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = Object.fromEntries(new URLSearchParams(rawText));
    }

    // Handle nested "Data" or "data" wrapper (Zapier format)
    let data = body;
    const rawData = body.Data || body.data;
    if (rawData) {
      if (typeof rawData === "string") {
        try { data = JSON.parse(rawData); } catch { data = rawData; }
      } else {
        data = rawData;
      }
    }

    // --- Extract fields from Fathom webhook payload ---
    // Fathom API webhook format has top-level fields:
    // title, meeting_title, url, share_url, transcript[], default_summary, action_items[], calendar_invitees[], recorded_by
    
    // Also support the nested meeting/recording format from Zapier
    const meeting = data.meeting || {};
    const recording = data.recording || {};
    const fathomUser = data.fathom_user || {};
    const transcriptObj = data.transcript || {};

    // Meeting topic: try Fathom API format first, then nested, then fallback
    const meeting_topic = data.title || data.meeting_title || meeting.title || data.meeting_topic || data.topic || body.meeting_topic || "Untitled Meeting";

    // Transcript: Fathom API sends array of {speaker, text}, or nested plaintext
    const rawTranscript = data.transcript || transcriptObj;
    const transcript = transcriptToPlaintext(rawTranscript);

    // Summary: Fathom API sends default_summary object
    const defaultSummary = data.default_summary || {};
    const summary = defaultSummary.markdown_formatted || defaultSummary.text || data.summary || body.summary || "";

    // Client name: from calendar_invitees (first external person)
    const invitees = data.calendar_invitees || meeting.invitees || [];
    const recordedBy = data.recorded_by || {};
    const externalInvitee = invitees.find((inv: any) => inv.email !== recordedBy.email);
    const client_name = externalInvitee?.name || meeting.invitees?.[0]?.name || data.client_name || body.client_name || "";

    // Meeting date
    const meeting_date = data.started_at || data.meeting_date || meeting.scheduled_start_time || body.meeting_date || new Date().toISOString();

    // User email
    const user_email = recordedBy.email || fathomUser.email || data.user_email || body.user_email || "";

    // Action items / issues
    const actionItems = data.action_items || [];
    const issues_discussed = actionItems.length
      ? actionItems.map((ai: any) => `- ${ai.text || ai.content || JSON.stringify(ai)}`).join("\n")
      : (data.issues_discussed || body.issues_discussed || "");

    // Share URL
    const share_url = data.share_url || data.url || recording.share_url || recording.url || "";

    // Duration
    const duration = data.duration_in_minutes || recording.duration_in_minutes || null;

    console.log("Parsed - topic:", meeting_topic, "client:", client_name, "email:", user_email, "transcript_len:", transcript.length, "summary_len:", summary.length);

    // Skip empty pings (no transcript and no title)
    if (!transcript && meeting_topic === "Untitled Meeting" && !summary) {
      console.log("Skipping empty webhook ping");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Empty ping" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up user by email
    let userId: string | null = null;
    if (user_email) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.users?.find((u: any) => u.email === user_email);
      if (user) userId = user.id;
    }

    const finalSummary = summary || (duration ? `${Math.round(duration)} min call. Recording: ${share_url}` : null);

    const { data: inserted, error } = await supabaseAdmin
      .from("zoom_transcripts")
      .insert({
        user_id: userId,
        meeting_topic,
        meeting_date,
        summary: finalSummary,
        transcript: transcript || null,
        client_name: client_name || null,
        issues_discussed: issues_discussed || null,
        status: "new",
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Successfully inserted transcript:", inserted.id);

    return new Response(
      JSON.stringify({ success: true, id: inserted.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
