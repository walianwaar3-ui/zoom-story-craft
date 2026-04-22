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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content_id, notes } = await req.json();

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

    // Load existing post
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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
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

    const captionPrompt = getPrompt("Caption Prompt", "Caption", "caption prompt", "caption");
    if (!captionPrompt) {
      return new Response(
        JSON.stringify({ error: "No 'Caption Prompt' entry found in knowledgebase." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build context: brand/voice/strategy entries
    const contextEntries = (kbEntries || []).filter((e: any) =>
      /brand|voice|strategy|guideline/i.test(e.category || "") ||
      /brand|voice|strategy|guideline/i.test(e.title || ""),
    );
    const extraContext = contextEntries
      .map((e: any) => `### ${e.title}\n${e.content}`)
      .join("\n\n");

    // Build source material — try transcript if linked, else fall back to existing caption
    let sourceMaterial = "";
    if (post.transcript_id) {
      const { data: transcript } = await supabaseAdmin
        .from("zoom_transcripts")
        .select("meeting_topic, summary, transcript, issues_discussed, client_name")
        .eq("id", post.transcript_id)
        .single();
      if (transcript) {
        sourceMaterial = `MEETING TOPIC: ${transcript.meeting_topic || ""}
CLIENT: ${transcript.client_name || ""}
SUMMARY: ${transcript.summary || ""}
ISSUES DISCUSSED: ${transcript.issues_discussed || ""}
TRANSCRIPT EXCERPT: ${(transcript.transcript || "").slice(0, 4000)}`;
      }
    }

    if (!sourceMaterial) {
      sourceMaterial = `PREVIOUS CAPTION (rewrite this with a fresh angle — same topic, different hook & structure):\n${post.caption || "(none)"}`;
    }

    const userMessage = `${sourceMaterial}

${notes ? `USER NOTES ON WHAT TO IMPROVE:\n${notes}\n` : ""}
IMPORTANT: The image for this post is already generated and will NOT change. Write a NEW caption that fits the existing visual concept but with a stronger hook, sharper structure, and clearer CTA than the previous version.

Respond with the [POST] block and [VISUAL DIRECTION] block as specified.`;

    const systemPrompt = extraContext
      ? `${captionPrompt}\n\n---\nADDITIONAL BRAND CONTEXT:\n${extraContext}`
      : captionPrompt;

    let captionRaw = "";
    try {
      const res = await fetchWithTimeout(
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
            max_tokens: 1500,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
          }),
        },
        45_000,
      );

      if (!res.ok) {
        const status = res.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited by Claude. Please try again in a moment." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 529) {
          return new Response(JSON.stringify({ error: "Claude API is overloaded. Please retry shortly." }), {
            status: 529,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 401) {
          return new Response(JSON.stringify({ error: "Invalid Anthropic API key. Update ANTHROPIC_API_KEY in Settings." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await res.text();
        console.error("Caption error:", status, t);
        return new Response(JSON.stringify({ error: "Caption generation failed — retry" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const blocks = data?.content;
      captionRaw = Array.isArray(blocks)
        ? blocks
            .filter((b: any) => b?.type === "text" && typeof b.text === "string")
            .map((b: any) => b.text)
            .join("")
        : "";
    } catch (e) {
      console.error("Caption exception:", e);
      return new Response(
        JSON.stringify({
          error:
            e instanceof Error && e.name === "AbortError"
              ? "Caption generation timed out — retry"
              : "Caption generation failed — retry",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract [POST] block
    const postMatch = captionRaw.match(/\[POST\]\s*([\s\S]*?)(?:\n\s*\[VISUAL DIRECTION\]|$)/i);
    const newCaption = postMatch?.[1]?.trim() || captionRaw.trim();

    if (!newCaption) {
      return new Response(JSON.stringify({ error: "Empty caption returned — retry" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update only caption (and bump regenerated_count)
    const { error: updateError } = await supabaseAdmin
      .from("generated_content")
      .update({
        caption: newCaption,
        regenerated_count: (post.regenerated_count || 0) + 1,
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
      JSON.stringify({ success: true, content_id, caption: newCaption }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("regenerate-caption-only error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
