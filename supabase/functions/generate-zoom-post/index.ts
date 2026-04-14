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
    const { transcript_id, custom_prompt, aspect_ratio } = await req.json();

    if (!transcript_id) {
      return new Response(
        JSON.stringify({ error: "transcript_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch transcript
    const { data: transcript, error: fetchError } = await supabaseAdmin
      .from("zoom_transcripts")
      .select("*")
      .eq("id", transcript_id)
      .single();

    if (fetchError || !transcript) {
      return new Response(
        JSON.stringify({ error: "Transcript not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Fetch prompts from knowledgebase ---
    const { data: kbEntries } = await supabaseAdmin
      .from("knowledgebase")
      .select("category, title, content")
      .in("category", ["Caption Prompt", "Image Prompt", "Brand Guidelines", "Voice & Tone", "Campaign Strategy"]);

    const kbMap: Record<string, string> = {};
    const kbByCategory: Record<string, string[]> = {};
    for (const entry of kbEntries || []) {
      kbMap[entry.category] = entry.content;
      if (!kbByCategory[entry.category]) kbByCategory[entry.category] = [];
      kbByCategory[entry.category].push(`[${entry.title}]: ${entry.content}`);
    }

    // Build context from all KB categories
    const contextParts: string[] = [];
    if (kbByCategory["Brand Guidelines"]?.length) {
      contextParts.push(`BRAND GUIDELINES:\n${kbByCategory["Brand Guidelines"].join("\n\n")}`);
    }
    if (kbByCategory["Voice & Tone"]?.length) {
      contextParts.push(`VOICE & TONE:\n${kbByCategory["Voice & Tone"].join("\n\n")}`);
    }
    if (kbByCategory["Campaign Strategy"]?.length) {
      contextParts.push(`CAMPAIGN STRATEGY:\n${kbByCategory["Campaign Strategy"].join("\n\n")}`);
    }
    const kbContext = contextParts.length ? "\n\nADDITIONAL CONTEXT FROM KNOWLEDGEBASE:\n" + contextParts.join("\n\n") : "";

    // --- STEP 1: Generate Caption ---
    const baseCaptionPrompt = kbMap["Caption Prompt"] || "You are a social media content strategist. Generate a compelling Facebook post from the meeting content. Focus on the actual topics discussed in the meeting.";
    const captionSystemPrompt = baseCaptionPrompt + kbContext;

    const captionPrompt = custom_prompt
      ? `${custom_prompt}\n\nMeeting: ${transcript.meeting_topic}\nClient: ${transcript.client_name || "N/A"}\nSummary: ${transcript.summary || "N/A"}\nIssues: ${transcript.issues_discussed || "N/A"}\nTranscript excerpt: ${(transcript.transcript || "").slice(0, 3000)}`
      : `Generate a Facebook post based on this meeting conversation. Use the actual content and topics discussed — do not assume any industry or context beyond what is provided.

Meeting: ${transcript.meeting_topic}
Client: ${transcript.client_name || "N/A"}
Summary: ${transcript.summary || "N/A"}
Key Issues: ${transcript.issues_discussed || "N/A"}
Transcript: ${(transcript.transcript || "").slice(0, 3000)}`;

    const captionResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: captionSystemPrompt },
            { role: "user", content: captionPrompt },
          ],
        }),
      }
    );

    if (!captionResponse.ok) {
      const status = captionResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await captionResponse.text();
      console.error("Caption generation error:", status, errText);
      return new Response(JSON.stringify({ error: "Failed to generate caption" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const captionData = await captionResponse.json();
    const caption = captionData.choices?.[0]?.message?.content || "";

    // --- STEP 2: Generate Image using fal.ai ---

    // Fetch overlay images from knowledgebase
    const { data: overlayEntries } = await supabaseAdmin
      .from("knowledgebase")
      .select("image_url")
      .eq("category", "Overlay Images")
      .not("image_url", "is", null);

    const overlayPhotos = (overlayEntries || [])
      .map((e: any) => e.image_url)
      .filter((url: string) => url);

    if (!overlayPhotos.length) {
      console.error("No overlay images found in knowledgebase");
    }

    const selectedPhoto = overlayPhotos.length
      ? overlayPhotos[Math.floor(Math.random() * overlayPhotos.length)]
      : null;

    // Extract hook from caption (first line/sentence)
    const hookLine = caption.split("\n").find((l: string) => l.trim().length > 0) || transcript.meeting_topic;
    const captionLines = caption.split("\n").filter((l: string) => l.trim().length > 0);
    const supportingLine = captionLines.length > 1 ? captionLines[1].trim() : "";

    // Build image prompt from knowledgebase template or fallback
    const imagePromptTemplate = kbMap["Image Prompt"] || "";
    let imagePrompt: string;

    if (imagePromptTemplate) {
      imagePrompt = imagePromptTemplate
        .replace("{hook_line}", hookLine.slice(0, 80))
        .replace("{supporting_line}", supportingLine.slice(0, 60))
        .replace("{aspect_ratio}", aspect_ratio || "1:1");
    } else {
      imagePrompt = `Create a clean, professional social media image related to this topic: "${hookLine.slice(0, 80)}". Aspect ratio: ${aspect_ratio || "1:1"}. Use modern, minimal design.`;
    }

    let imageUrl: string | null = null;
    const FAL_KEY = Deno.env.get("FAL_KEY");

    if (FAL_KEY && selectedPhoto) {
      const sizeMap: Record<string, { width: number; height: number }> = {
        "1:1": { width: 1024, height: 1024 },
        "9:16": { width: 768, height: 1344 },
        "16:9": { width: 1344, height: 768 },
        "4:5": { width: 896, height: 1120 },
      };
      const imageSize = sizeMap[aspect_ratio || "1:1"] || sizeMap["1:1"];

      try {
        const falResponse = await fetch(
          "https://fal.run/fal-ai/nano-banana-2/edit",
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
          }
        );

        if (falResponse.ok) {
          const falData = await falResponse.json();
          imageUrl = falData.images?.[0]?.url || null;
        } else {
          const errText = await falResponse.text();
          console.error("fal.ai image generation failed:", falResponse.status, errText);
        }
      } catch (falErr) {
        console.error("fal.ai error:", falErr);
      }
    } else {
      console.error("FAL_KEY not configured or no overlay photo, skipping image generation");
    }

    // --- STEP 3: Save to generated_content ---
    const { data: content, error: insertError } = await supabaseAdmin
      .from("generated_content")
      .insert({
        transcript_id,
        caption,
        image_url: imageUrl,
        image_prompt: imagePrompt,
        aspect_ratio: aspect_ratio || "1:1",
        status: imageUrl ? "complete" : "text_only",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update transcript status
    await supabaseAdmin
      .from("zoom_transcripts")
      .update({ status: "used" })
      .eq("id", transcript_id);

    return new Response(
      JSON.stringify({
        success: true,
        content_id: content.id,
        caption,
        image_url: imageUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Generate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
