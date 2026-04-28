import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function createWebhookToken(contentId: string, mode: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${contentId}:${mode}`));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const contentId = url.searchParams.get("content_id") || "";
    const mode = url.searchParams.get("mode") || "generate";
    const token = url.searchParams.get("token") || "";
    const FAL_KEY = Deno.env.get("FAL_KEY") || "";

    if (!contentId || !FAL_KEY || !token) return json({ error: "Missing webhook authentication" }, 401);
    const expected = await createWebhookToken(contentId, mode, FAL_KEY);
    if (!safeEqual(token, expected)) return json({ error: "Invalid webhook token" }, 401);

    const body = await req.json();
    const status = String(body.status || "").toUpperCase();
    const payload = body.payload || body;
    const imageUrl = payload?.images?.[0]?.url || payload?.image?.url || null;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (status && status !== "OK" && status !== "COMPLETED") {
      await supabaseAdmin
        .from("generated_content")
        .update({ status: mode === "smart" ? "complete" : "text_only" })
        .eq("id", contentId);
      return json({ success: true, status: "failed_recorded" });
    }

    if (!imageUrl) return json({ success: true, status: "no_image_payload" });

    const update: Record<string, unknown> = { image_url: imageUrl, status: "complete" };
    if (mode === "smart") {
      const { data: current } = await supabaseAdmin
        .from("generated_content")
        .select("regenerated_count")
        .eq("id", contentId)
        .single();
      update.regenerated_count = (current?.regenerated_count || 0) + 1;
    }

    const { error } = await supabaseAdmin.from("generated_content").update(update).eq("id", contentId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, status: "completed", content_id: contentId });
  } catch (e) {
    console.error("fal-image-webhook error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});