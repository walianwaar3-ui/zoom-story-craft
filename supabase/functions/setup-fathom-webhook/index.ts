import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FATHOM_API_KEY = Deno.env.get("FATHOM_API_KEY");
    if (!FATHOM_API_KEY) {
      return new Response(JSON.stringify({ error: "FATHOM_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/zoom-webhook`;

    // First, list existing webhooks to avoid duplicates
    const listRes = await fetch("https://api.fathom.ai/external/v1/webhooks", {
      headers: { "X-Api-Key": FATHOM_API_KEY },
    });

    let existing: any[] = [];
    if (listRes.ok) {
      const listData = await listRes.json();
      existing = listData.webhooks || listData.items || listData.data || (Array.isArray(listData) ? listData : []);
      console.log("Existing webhooks:", JSON.stringify(existing));
    } else {
      console.log("Could not list webhooks:", listRes.status, await listRes.text());
    }

    // Create new webhook with full data
    const createRes = await fetch("https://api.fathom.ai/external/v1/webhooks", {
      method: "POST",
      headers: {
        "X-Api-Key": FATHOM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        destination_url: webhookUrl,
        include_transcript: true,
        include_summary: true,
        include_action_items: true,
        triggered_for: ["my_recordings"],
      }),
    });

    const createData = await createRes.text();
    console.log("Create webhook response:", createRes.status, createData);

    if (!createRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to create webhook", status: createRes.status, details: createData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, webhook: JSON.parse(createData) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Setup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
