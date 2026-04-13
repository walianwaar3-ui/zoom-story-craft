import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawText = await req.text();
    console.log("=== RAW WEBHOOK PAYLOAD (first 500 chars) ===");
    console.log(rawText.slice(0, 500));

    let body: any;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = Object.fromEntries(new URLSearchParams(rawText));
    }

    // Handle Fathom/Zapier nested format: { "Data": { ... } }
    // Also handle if Data is a JSON string
    let data = body;
    // Handle both "Data" and "data" keys (Fathom/Zapier sends lowercase "data")
    const rawData = body.Data || body.data;
    if (rawData) {
      if (typeof rawData === "string") {
        try { data = JSON.parse(rawData); } catch { data = rawData; }
      } else {
        data = rawData;
      }
    }

    // Extract fields from Fathom structure
    const meeting = data.meeting || {};
    const recording = data.recording || {};
    const fathomUser = data.fathom_user || {};
    const transcriptObj = data.transcript || {};

    const meeting_topic = meeting.title || data.meeting_topic || data.topic || body.meeting_topic || "Untitled Meeting";
    const transcript = transcriptObj.plaintext || data.transcript || body.transcript || "";
    const summary = data.summary || body.summary || "";
    const client_name = meeting.invitees?.[0]?.name || data.client_name || body.client_name || "";
    const meeting_date = meeting.scheduled_start_time || data.meeting_date || body.meeting_date || new Date().toISOString();
    const user_email = fathomUser.email || data.user_email || body.user_email || "";
    const issues_discussed = data.issues_discussed || body.issues_discussed || "";
    const share_url = recording.share_url || recording.url || "";
    const duration = recording.duration_in_minutes || null;

    console.log("Parsed - topic:", meeting_topic, "client:", client_name, "email:", user_email, "transcript_len:", transcript.length);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Optionally look up user by email
    let userId: string | null = null;
    if (user_email) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.users?.find((u: any) => u.email === user_email);
      if (user) userId = user.id;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("zoom_transcripts")
      .insert({
        user_id: userId,
        meeting_topic,
        meeting_date,
        summary: summary || (duration ? `${Math.round(duration)} min call. Recording: ${share_url}` : null),
        transcript: typeof transcript === "string" ? transcript : JSON.stringify(transcript),
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
