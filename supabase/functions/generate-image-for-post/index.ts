import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAllowedFalUrl(url: string) {
  try {
    const p = new URL(url);
    return p.protocol === "https:" && p.hostname === "queue.fal.run";
  } catch {
    return false;
  }
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

async function buildFalWebhookUrl(contentId: string, mode: "generate", falKey: string) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  if (!baseUrl) return null;
  const token = await createWebhookToken(contentId, mode, falKey);
  const url = new URL(`${baseUrl}/functions/v1/fal-image-webhook`);
  url.searchParams.set("content_id", contentId);
  url.searchParams.set("mode", mode);
  url.searchParams.set("token", token);
  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  console.log("[generate-image-for-post] invoked");

  try {
    const body = await req.json();
    const { content_id, action, status_url, response_url } = body;
    if (!content_id) return json({ error: "content_id is required" }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) return json({ error: "FAL_KEY not configured" }, 500);

    // POLL action
    if (action === "poll") {
      if (!status_url || !response_url) return json({ error: "status_url and response_url required" }, 400);
      if (!isAllowedFalUrl(status_url) || !isAllowedFalUrl(response_url)) {
        return json({ error: "Invalid fal.ai URL" }, 400);
      }

      const sRes = await fetchWithTimeout(status_url, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      }, 15_000);
      if (!sRes.ok) return json({ error: `fal.ai status check failed (${sRes.status})` }, 500);
      const sData = await sRes.json();

      if (sData.status === "COMPLETED") {
        const fRes = await fetchWithTimeout(response_url, {
          headers: { Authorization: `Key ${FAL_KEY}` },
        }, 20_000);
        if (!fRes.ok) return json({ error: `fal.ai result fetch failed (${fRes.status})` }, 500);
        const fData = await fRes.json();
        const imageUrl = fData.images?.[0]?.url || null;
        if (!imageUrl) {
          await supabaseAdmin.from("generated_content").update({ status: "text_only" }).eq("id", content_id);
          return json({ error: "fal.ai returned no image" }, 500);
        }
        const { error: upErr } = await supabaseAdmin
          .from("generated_content")
          .update({ image_url: imageUrl, status: "complete" })
          .eq("id", content_id);
        if (upErr) return json({ error: upErr.message }, 500);
        return json({ success: true, status: "completed", content_id, image_url: imageUrl });
      }

      if (sData.status === "FAILED" || sData.status === "ERROR") {
        await supabaseAdmin.from("generated_content").update({ status: "text_only" }).eq("id", content_id);
        return json({ error: sData.error || "fal.ai image generation failed" }, 500);
      }

      return json({ status: "processing" }, 202);
    }

    // SUBMIT action
    const { data: post, error: pErr } = await supabaseAdmin
      .from("generated_content")
      .select("*")
      .eq("id", content_id)
      .single();
    if (pErr || !post) return json({ error: "Post not found" }, 404);
    if (!post.image_prompt) return json({ error: "Post has no saved image_prompt — cannot generate image" }, 400);

    // Pick a random overlay
    const { data: overlayEntries } = await supabaseAdmin
      .from("knowledgebase")
      .select("title, image_url")
      .eq("category", "Overlay Images")
      .not("image_url", "is", null);
    const overlays = (overlayEntries || []).filter((e: any) => e.image_url);
    if (overlays.length === 0) return json({ error: "No overlay images available in knowledgebase" }, 400);
    const selectedPhoto = overlays[Math.floor(Math.random() * overlays.length)].image_url;

    const sizeMap: Record<string, { width: number; height: number }> = {
      "1:1": { width: 1024, height: 1024 },
      "9:16": { width: 768, height: 1344 },
      "16:9": { width: 1344, height: 768 },
      "4:5": { width: 896, height: 1120 },
    };
    const imageSize = sizeMap[post.aspect_ratio || "1:1"] || sizeMap["1:1"];

    const webhookUrl = await buildFalWebhookUrl(content_id, "generate", FAL_KEY);
    const falSubmitUrl = new URL("https://queue.fal.run/fal-ai/nano-banana-2/edit");
    if (webhookUrl) falSubmitUrl.searchParams.set("fal_webhook", webhookUrl);

    const submitRes = await fetchWithTimeout(
      falSubmitUrl.toString(),
      {
        method: "POST",
        headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: post.image_prompt,
          image_urls: [selectedPhoto],
          image_size: imageSize,
          num_images: 1,
        }),
      },
      15_000,
    );

    if (!submitRes.ok) {
      const t = await submitRes.text();
      console.error("fal submit failed:", submitRes.status, t);
      return json({ error: `fal.ai submission failed (${submitRes.status})` }, 500);
    }

    const submitData = await submitRes.json();
    if (!submitData.status_url || !submitData.response_url) {
      return json({ error: "fal.ai returned no tracking URLs" }, 500);
    }

    await supabaseAdmin.from("generated_content").update({ status: "regenerating" }).eq("id", content_id);

    return json(
      {
        success: true,
        status: "processing",
        content_id,
        status_url: submitData.status_url,
        response_url: submitData.response_url,
      },
      202,
    );
  } catch (e) {
    console.error("generate-image-for-post error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
