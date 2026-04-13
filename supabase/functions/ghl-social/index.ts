import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GHL_BASE = "https://services.leadconnectorhq.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GHL_API_KEY = Deno.env.get("GHL_API_KEY");
    const GHL_LOCATION_ID = Deno.env.get("GHL_LOCATION_ID");

    if (!GHL_API_KEY) {
      return new Response(JSON.stringify({ error: "GHL_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!GHL_LOCATION_ID) {
      return new Response(JSON.stringify({ error: "GHL_LOCATION_ID not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "accounts";

    if (action === "accounts") {
      const response = await fetch(
        `${GHL_BASE}/social-media-posting/${GHL_LOCATION_ID}/accounts`,
        {
          headers: {
            Authorization: `Bearer ${GHL_API_KEY}`,
            Version: "2021-07-28",
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("GHL accounts error:", response.status, errText);
        return new Response(JSON.stringify({ error: `GHL API error: ${response.status}`, details: errText }), {
          status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "post") {
      const { caption, image_url, account_ids, schedule_date, post_type, user_id } = body;

      if (!account_ids || !account_ids.length) {
        return new Response(JSON.stringify({ error: "account_ids required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!caption) {
        return new Response(JSON.stringify({ error: "caption required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const postBody: any = {
        accountIds: account_ids,
        summary: caption,
        status: schedule_date ? "scheduled" : "draft",
        type: post_type || "post",
        userId: user_id || GHL_LOCATION_ID,
      };

      if (schedule_date) {
        postBody.scheduleDate = schedule_date;
      }

      if (image_url && image_url.startsWith("http")) {
        postBody.media = [{
          url: image_url,
          type: "image/jpeg",
        }];
      }

      console.log("Posting to GHL:", JSON.stringify({ accountIds: account_ids, hasMedia: !!postBody.media, status: postBody.status }));

      const response = await fetch(
        `${GHL_BASE}/social-media-posting/${GHL_LOCATION_ID}/posts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GHL_API_KEY}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
          body: JSON.stringify(postBody),
        }
      );

      const responseText = await response.text();
      let responseData;
      try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

      if (!response.ok) {
        console.error("GHL post error:", response.status, responseText);
        return new Response(JSON.stringify({ error: `GHL API error: ${response.status}`, details: responseData }), {
          status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, post: responseData }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use action: 'accounts' or 'post'" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("GHL error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
