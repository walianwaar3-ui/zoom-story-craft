import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_MODEL = "claude-sonnet-4-5";

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function handleClaudeError(status: number) {
  if (status === 429) {
    return new Response(JSON.stringify({ error: "Rate limited by Claude. Please try again in a moment." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (status === 529) {
    return new Response(JSON.stringify({ error: "Claude API is overloaded. Please retry shortly." }), {
      status: 529, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (status === 401) {
    return new Response(JSON.stringify({ error: "Invalid Anthropic API key. Update ANTHROPIC_API_KEY in Settings." }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

function parseClaudeText(data: any): string {
  const blocks = data?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("");
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAllowedFalUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "queue.fal.run";
  } catch {
    return false;
  }
}

async function pollFalJob(FAL_KEY: string, statusUrl: string, responseUrl: string) {
  if (!isAllowedFalUrl(statusUrl) || !isAllowedFalUrl(responseUrl)) {
    throw new Error("Invalid fal.ai job URL");
  }

  const statusRes = await fetchWithTimeout(statusUrl, {
    headers: { Authorization: `Key ${FAL_KEY}` },
  }, 15_000);

  if (!statusRes.ok) {
    throw new Error(`fal.ai status check failed (${statusRes.status})`);
  }

  const statusData = await statusRes.json();
  if (statusData.status === "COMPLETED") {
    const finalRes = await fetchWithTimeout(responseUrl, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    }, 20_000);
    if (!finalRes.ok) throw new Error(`fal.ai result fetch failed (${finalRes.status})`);
    const finalData = await finalRes.json();
    return { status: "completed", imageUrl: finalData.images?.[0]?.url || null };
  }

  if (statusData.status === "FAILED" || statusData.status === "ERROR") {
    return { status: "failed", error: statusData.error || "fal.ai image generation failed" };
  }

  return { status: "processing" };
}

// Fetch an image URL and convert it to base64 + media type for Claude vision
async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetchWithTimeout(url, {}, 15_000);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const contentType = res.headers.get("content-type") || "image/png";
  const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  const mediaType = allowed.includes(contentType.toLowerCase()) ? contentType.toLowerCase() : "image/png";
  const buf = new Uint8Array(await res.arrayBuffer());
  // Base64-encode in chunks to avoid call-stack issues with large images
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  const data = btoa(binary);
  return { data, mediaType };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log("[smart-regenerate-image] invoked", req.method);
  try {
    const body = await req.json();
    const { content_id, complaints, free_text, auto_analyze } = body;
    console.log("[smart-regenerate-image] body", JSON.stringify({ content_id, complaints, free_text, auto_analyze }));

    if (!content_id) {
      return new Response(JSON.stringify({ error: "content_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // STEP 1: Load existing post
    const { data: post, error: postError } = await supabaseAdmin
      .from("generated_content")
      .select("*")
      .eq("id", content_id)
      .single();

    if (postError || !post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!post.image_url) {
      return new Response(
        JSON.stringify({ error: "This post has no existing image to analyze. Use Quick Regenerate instead." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch KB
    const { data: kbEntries } = await supabaseAdmin
      .from("knowledgebase")
      .select("category, title, content");

    const kbMap: Record<string, string> = {};
    for (const entry of kbEntries || []) {
      if (!kbMap[entry.title]) kbMap[entry.title] = entry.content;
      if (!kbMap[entry.title.toLowerCase()]) kbMap[entry.title.toLowerCase()] = entry.content;
    }
    const getPrompt = (...keys: string[]) => {
      for (const k of keys) {
        if (kbMap[k]) return kbMap[k];
        if (kbMap[k.toLowerCase()]) return kbMap[k.toLowerCase()];
      }
      return null;
    };

    // STEP 2: Diagnostic Analysis (vision)
    const diagnosticPrompt = getPrompt("Regeneration Diagnostic", "regeneration diagnostic");
    if (!diagnosticPrompt) {
      return new Response(
        JSON.stringify({ error: "No 'Regeneration Diagnostic' entry found in knowledgebase." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build user complaint text
    const complaintLabels: Record<string, string> = {
      spelling: "Text has spelling errors",
      cutoff: "Text cut off or too small",
      icons: "Wrong icons/objects",
      face: "Face looks off",
      vague: "Overall vague or unclear",
    };
    const stated = (complaints || [])
      .map((c: string) => complaintLabels[c] || c)
      .filter(Boolean);
    const userNotes = auto_analyze
      ? "User did not specify — auto-analyze fully"
      : [
          stated.length ? `Checked issues: ${stated.join("; ")}` : null,
          free_text ? `Free-text: ${free_text}` : null,
        ]
          .filter(Boolean)
          .join("\n") || "User did not specify — auto-analyze fully";

    // Fetch the existing image and base64-encode it for Claude vision
    let imgB64: { data: string; mediaType: string };
    try {
      imgB64 = await fetchImageAsBase64(post.image_url);
    } catch (e) {
      console.error("Image fetch failed:", e);
      return new Response(
        JSON.stringify({ error: "Could not load existing image for analysis — retry" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const diagnosticUserContent = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: imgB64.mediaType,
          data: imgB64.data,
        },
      },
      {
        type: "text",
        text: `CAPTION:\n${post.caption || "(none)"}\n\nPREVIOUS IMAGE PROMPT SENT TO IMAGE MODEL:\n${post.image_prompt || "(none)"}\n\nUSER COMPLAINTS:\n${userNotes}\n\nAnalyze the image and respond with EXACTLY these two blocks:\n[DIAGNOSTIC REPORT]\n<bullet list of concrete problems found in the image, or "NO CRITICAL ISSUES" if image is clean>\n\n[CORRECTIVE INSTRUCTIONS FOR IMAGE PROMPT BUILDER]\n<short, explicit instructions the prompt builder must apply on the next attempt — e.g. "spell PROFITABLE correctly", "ensure all text fits within frame", "remove generic stock icon, use construction blueprint instead">`,
      },
    ];

    let diagnosticReport = "";
    let correctiveInstructions = "";
    try {
      const diagRes = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 600,
            system: diagnosticPrompt,
            messages: [{ role: "user", content: diagnosticUserContent }],
          }),
        },
        45_000,
      );

      if (!diagRes.ok) {
        const errResp = handleClaudeError(diagRes.status);
        if (errResp) return errResp;
        const t = await diagRes.text();
        console.error("Diagnostic error:", diagRes.status, t);
        return new Response(JSON.stringify({ error: "Diagnostic analysis failed — retry" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const diagData = await diagRes.json();
      const raw = parseClaudeText(diagData);
      const reportMatch = raw.match(
        /\[DIAGNOSTIC REPORT\]\s*([\s\S]*?)(?:\n\s*\[CORRECTIVE INSTRUCTIONS[^\]]*\]|$)/i,
      );
      const corrMatch = raw.match(/\[CORRECTIVE INSTRUCTIONS[^\]]*\]\s*([\s\S]*)$/i);
      diagnosticReport = reportMatch?.[1]?.trim() || raw.trim();
      correctiveInstructions = corrMatch?.[1]?.trim() || "";
    } catch (e) {
      console.error("Diagnostic exception:", e);
      return new Response(
        JSON.stringify({
          error:
            e instanceof Error && e.name === "AbortError"
              ? "Diagnostic timed out — retry"
              : "Diagnostic failed — retry",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const noIssues = /no critical issues/i.test(diagnosticReport) && !correctiveInstructions;
    if (noIssues) {
      correctiveInstructions =
        "Generate a fresh variation with stronger composition, sharper typography, and clearer focal hierarchy.";
    }

    // STEP 3: Image Prompt Builder with corrective instructions prepended
    const imagePromptBuilder = getPrompt(
      "Image Prompt Builder",
      "Image Prompt",
      "image prompt builder",
      "image prompt",
    );

    const { data: overlayEntries } = await supabaseAdmin
      .from("knowledgebase")
      .select("title, content, image_url")
      .eq("category", "Overlay Images")
      .not("image_url", "is", null);

    const overlays = (overlayEntries || []).filter((e: any) => e.image_url);
    const overlayLibraryList = overlays
      .map((e: any) => `- ${e.title}: ${(e.content || "").slice(0, 120)}`)
      .join("\n");

    let imageDescription = "";
    let overlayTag = "";
    let imagePrompt = "";
    let selectedPhoto: string | null = null;
    let llmBuilderError: string | null = null;

    if (imagePromptBuilder && overlays.length > 0) {
      const builderSystem = `${imagePromptBuilder}

AVAILABLE OVERLAY IMAGES (pick one tag from this list for [OVERLAY_TAG]):
${overlayLibraryList}

OUTPUT FORMAT — respond with EXACTLY these two blocks and nothing else:
[OVERLAY_TAG]
<single overlay title from the list above>

[IMAGE_DESCRIPTION]
<a concise 300-500 character visual description for an image generation model — describe composition, mood, lighting, text overlays, layout. Do NOT include the overlay-image instructions, only the final scene description.>`;

      const builderUser = `CORRECTIVE INSTRUCTIONS (HIGHEST PRIORITY — the previous attempt had these problems and your new image description MUST address each correction explicitly):
${correctiveInstructions}

PREVIOUS PROMPT (for reference — do NOT repeat its mistakes):
${post.image_prompt || "(none)"}

CAPTION:
${post.caption || ""}

ASPECT RATIO: ${post.aspect_ratio || "1:1"}`;

      try {
        const builderRes = await fetchWithTimeout(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: ANTHROPIC_MODEL,
              max_tokens: 800,
              system: builderSystem,
              messages: [{ role: "user", content: builderUser }],
            }),
          },
          30_000,
        );

        if (!builderRes.ok) {
          const errResp = handleClaudeError(builderRes.status);
          if (errResp) return errResp;
          console.error("Builder failed:", builderRes.status, await builderRes.text());
          llmBuilderError = `LLM error ${builderRes.status}`;
        } else {
          const builderData = await builderRes.json();
          const raw = parseClaudeText(builderData);
          const tagMatch = raw.match(/\[OVERLAY_TAG\]\s*([\s\S]*?)(?:\n\s*\[IMAGE_DESCRIPTION\]|$)/i);
          const descMatch = raw.match(/\[IMAGE_DESCRIPTION\]\s*([\s\S]*)$/i);
          overlayTag = tagMatch?.[1]?.trim() || "";
          imageDescription = descMatch?.[1]?.trim() || "";

          if (!overlayTag || !imageDescription) {
            console.error("Builder returned invalid format:", raw);
            llmBuilderError = "Image description generation failed — retry";
          } else {
            const tagLower = overlayTag.toLowerCase();
            const matched =
              overlays.find((o: any) => o.title?.toLowerCase() === tagLower) ||
              overlays.find(
                (o: any) =>
                  o.title?.toLowerCase().includes(tagLower) ||
                  tagLower.includes(o.title?.toLowerCase()),
              );
            selectedPhoto = (matched || overlays[Math.floor(Math.random() * overlays.length)]).image_url;
            imagePrompt = imageDescription;
          }
        }
      } catch (e) {
        console.error("Builder exception:", e);
        llmBuilderError =
          e instanceof Error && e.name === "AbortError"
            ? "Image description generation timed out — retry"
            : "Image description generation failed — retry";
      }
    } else {
      llmBuilderError = !imagePromptBuilder
        ? "No 'Image Prompt Builder' entry in knowledgebase"
        : "No overlay images available";
    }

    if (llmBuilderError || !selectedPhoto || !imagePrompt) {
      return new Response(JSON.stringify({ error: llmBuilderError || "Failed to build image prompt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STEP 4: Regenerate with fal.ai
    let imageUrl: string | null = null;
    if (FAL_KEY) {
      const sizeMap: Record<string, { width: number; height: number }> = {
        "1:1": { width: 1024, height: 1024 },
        "9:16": { width: 768, height: 1344 },
        "16:9": { width: 1344, height: 768 },
        "4:5": { width: 896, height: 1120 },
      };
      const imageSize = sizeMap[post.aspect_ratio || "1:1"] || sizeMap["1:1"];

      try {
        const submitRes = await fetchWithTimeout(
          "https://queue.fal.run/fal-ai/nano-banana-2/edit",
          {
            method: "POST",
            headers: {
              Authorization: `Key ${FAL_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: imagePrompt,
              image_urls: [selectedPhoto],
              image_size: imageSize,
              num_images: 1,
            }),
          },
          15_000,
        );

        if (!submitRes.ok) {
          console.error("fal submit failed:", submitRes.status, await submitRes.text());
        } else {
          const submitData = await submitRes.json();
          const statusUrl = submitData.status_url;
          const responseUrl = submitData.response_url;
          const deadline = Date.now() + 60_000;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 2000));
            const statusRes = await fetch(statusUrl, {
              headers: { Authorization: `Key ${FAL_KEY}` },
            });
            if (!statusRes.ok) continue;
            const statusData = await statusRes.json();
            if (statusData.status === "COMPLETED") {
              const finalRes = await fetch(responseUrl, {
                headers: { Authorization: `Key ${FAL_KEY}` },
              });
              if (finalRes.ok) {
                const finalData = await finalRes.json();
                imageUrl = finalData.images?.[0]?.url || null;
              }
              break;
            }
            if (statusData.status === "FAILED" || statusData.status === "ERROR") {
              console.error("fal failed:", statusData);
              break;
            }
          }
        }
      } catch (falErr) {
        console.error("fal error:", falErr);
      }
    }

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Image generation timed out — please try again" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // STEP 5: UPDATE existing record
    const lastDiagnostic = `PROBLEMS FOUND:\n${diagnosticReport}\n\nCORRECTIONS APPLIED:\n${correctiveInstructions}`;

    const { error: updateError } = await supabaseAdmin
      .from("generated_content")
      .update({
        image_url: imageUrl,
        image_prompt: imagePrompt,
        regenerated_count: (post.regenerated_count || 0) + 1,
        last_diagnostic: lastDiagnostic,
        status: "complete",
      })
      .eq("id", content_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        content_id,
        image_url: imageUrl,
        diagnostic_report: diagnosticReport,
        corrective_instructions: correctiveInstructions,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("smart-regenerate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
