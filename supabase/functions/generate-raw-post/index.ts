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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      caption,
      image_prompt,
      aspect_ratio = "1:1",
      reference_image_url,
    } = body || {};

    if (!caption || !String(caption).trim()) {
      return new Response(JSON.stringify({ error: "caption is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const FAL_KEY = Deno.env.get("FAL_KEY");
    const hasImagePrompt = !!(image_prompt && String(image_prompt).trim());
    const willSubmitImage = !!(FAL_KEY && hasImagePrompt);

    const { data: content, error: insertError } = await supabaseAdmin
      .from("generated_content")
      .insert({
        transcript_id: null,
        caption: String(caption).trim(),
        image_url: null,
        image_prompt: hasImagePrompt ? String(image_prompt).trim() : null,
        aspect_ratio: aspect_ratio || "1:1",
        status: willSubmitImage ? "regenerating" : "text_only",
        source: "raw",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (willSubmitImage) {
      const sizeMap: Record<string, { width: number; height: number }> = {
        "1:1": { width: 1024, height: 1024 },
        "9:16": { width: 768, height: 1344 },
        "16:9": { width: 1344, height: 768 },
        "4:5": { width: 896, height: 1120 },
      };
      const imageSize = sizeMap[aspect_ratio || "1:1"] || sizeMap["1:1"];

      try {
        const baseUrl = Deno.env.get("SUPABASE_URL")!;
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(FAL_KEY!),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const sig = await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${content.id}:generate`),
        );
        const token = Array.from(new Uint8Array(sig))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const webhookUrl = new URL(`${baseUrl}/functions/v1/fal-image-webhook`);
        webhookUrl.searchParams.set("content_id", content.id);
        webhookUrl.searchParams.set("mode", "generate");
        webhookUrl.searchParams.set("token", token);

        const hasRef = !!(reference_image_url && String(reference_image_url).trim());
        const falSubmitUrl = hasRef
          ? new URL("https://queue.fal.run/openai/gpt-image-2/edit")
          : new URL("https://queue.fal.run/openai/gpt-image-2");
        falSubmitUrl.searchParams.set("fal_webhook", webhookUrl.toString());

        const payload: Record<string, unknown> = {
          prompt: String(image_prompt).trim(),
          image_size: imageSize,
          num_images: 1,
          quality: "high",
        };
        if (hasRef) payload.image_urls = [reference_image_url];

        const submitRes = await fetchWithTimeout(
          falSubmitUrl.toString(),
          {
            method: "POST",
            headers: {
              Authorization: `Key ${FAL_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
          15_000,
        );

        if (!submitRes.ok) {
          const t = await submitRes.text();
          console.error("fal.ai submit failed:", submitRes.status, t);
          await supabaseAdmin
            .from("generated_content")
            .update({ status: "text_only" })
            .eq("id", content.id);
        }
      } catch (falErr) {
        console.error("fal.ai submit error:", falErr);
        await supabaseAdmin
          .from("generated_content")
          .update({ status: "text_only" })
          .eq("id", content.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        content_id: content.id,
        caption: content.caption,
        image_url: null,
        warning: willSubmitImage
          ? "Image generating in background"
          : hasImagePrompt
            ? "FAL_KEY not configured — caption saved only"
            : "No image prompt provided — caption saved only",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-raw-post error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
