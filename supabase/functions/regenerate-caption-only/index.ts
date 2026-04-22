import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_MODEL = "claude-sonnet-4-5";

const BANNED_WORDS: Array<{ word: string; replacement: string }> = [
  { word: "practitioner", replacement: "operator" },
  { word: "practitioners", replacement: "operators" },
  { word: "session", replacement: "delivery call" },
  { word: "sessions", replacement: "delivery calls" },
  { word: "modality", replacement: "offering" },
  { word: "modalities", replacement: "offerings" },
  { word: "intake", replacement: "onboarding" },
  { word: "roster", replacement: "client base" },
  { word: "healing", replacement: "transformation" },
  { word: "therapy", replacement: "coaching" },
  { word: "NLP", replacement: "method" },
  { word: "contractor", replacement: "operator" },
  { word: "construction", replacement: "industry" },
];

const TOOL_BRANDS: Array<{ brand: string; replacement: string }> = [
  { brand: "GoHighLevel", replacement: "their CRM" },
  { brand: "HighLevel", replacement: "their CRM" },
  { brand: "GHL", replacement: "their CRM" },
  { brand: "ClickFunnels", replacement: "their funnel builder" },
  { brand: "Kajabi", replacement: "their course platform" },
  { brand: "HubSpot", replacement: "their CRM" },
  { brand: "Salesforce", replacement: "their CRM" },
  { brand: "Zapier", replacement: "their automation stack" },
  { brand: "Make.com", replacement: "their automation stack" },
  { brand: "ActiveCampaign", replacement: "their email platform" },
  { brand: "Mailchimp", replacement: "their email platform" },
  { brand: "ConvertKit", replacement: "their email platform" },
  { brand: "Calendly", replacement: "their booking tool" },
  { brand: "ManyChat", replacement: "their chatbot tool" },
  { brand: "Typeform", replacement: "their form builder" },
];

const NAME_ALLOWLIST = new Set<string>([
  "Wali", "Wali Digital", "Carolyn", "Carolyn Miller",
]);

const OUTPUT_RULES_BLOCK = `

CRITICAL OUTPUT RULES (override anything else):
- Output ONLY two blocks, in this order: [POST] then [VISUAL DIRECTION]
- Do NOT output [MEETING CLASSIFICATION], [MEETING TYPE], [UNIVERSAL PATTERN], [SUGGESTED MOMENT FOR POST], or any preamble headers
- Do NOT use markdown headings (# or ##) anywhere in the output
- The [POST] block must contain ONLY the publishable Facebook post — no labels, no commentary, no meta text
- BANNED words (never appear in [POST]): practitioner, session, modality, intake, roster, healing, therapy, NLP, contractor, construction
- Translate any client-specific nouns to: founder, operator, coach, consultant, service provider, delivery call, offering, client base
- NEVER use real first or last names of clients, team members, or anyone mentioned in the input. Refer to them as "a founder", "an operator", "a coach", or use the archetype label provided.
- NEVER name specific third-party tools/brands (GoHighLevel, ClickFunnels, Kajabi, HubSpot, Zapier, ActiveCampaign, Calendly, ManyChat, etc.). Use generic terms: "their CRM", "their funnel builder", "their automation stack", "their email platform", "their booking tool".
- The post must read as a universal lesson — anyone could be the subject. No proper nouns identifying a specific client or vendor.`;

function deriveArchetype(transcript: any): string {
  const blob = `${transcript?.meeting_topic || ""} ${transcript?.summary || ""} ${transcript?.issues_discussed || ""}`.toLowerCase();
  if (/\bagency\b/.test(blob)) return "agency founder";
  if (/\bsaas\b|\bsoftware\b|\bplatform\b/.test(blob)) return "SaaS founder";
  if (/\bcoach|coaching|program\b/.test(blob)) return "coach scaling delivery";
  if (/\bconsult/.test(blob)) return "consultant";
  if (/\bservice|done.for.you|dfy\b/.test(blob)) return "service provider";
  if (/\bstrategy|systems?|scal(e|ing)|operator|c-?suite\b/.test(blob)) return "high-level strategic operator";
  return "founder";
}

function findClientNameMentions(text: string, clientName: string | null | undefined): string[] {
  const found = new Set<string>();
  if (clientName) {
    const parts = clientName.split(/\s+/).filter((p) => p.length >= 2);
    for (const p of parts) {
      if (NAME_ALLOWLIST.has(p)) continue;
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(text)) found.add(p);
    }
  }
  return Array.from(found);
}

function findToolBrandMentions(text: string): Array<{ brand: string; replacement: string }> {
  const found: Array<{ brand: string; replacement: string }> = [];
  for (const tb of TOOL_BRANDS) {
    const re = new RegExp(`\\b${tb.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) found.push(tb);
  }
  return found;
}

function scrubKnownPII(text: string, clientName: string | null | undefined, archetype: string): string {
  let out = text;
  if (clientName) {
    for (const p of clientName.split(/\s+/).filter((s) => s.length >= 2 && !NAME_ALLOWLIST.has(s))) {
      out = out.replace(new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), archetype);
    }
  }
  for (const tb of TOOL_BRANDS) {
    out = out.replace(
      new RegExp(`\\b${tb.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
      tb.replacement,
    );
  }
  return out;
}

function extractCleanCaption(rawText: string): { caption: string; visualDirection: string } {
  if (!rawText) return { caption: "", visualDirection: "" };

  // Layer 1a: try literal [POST] / [VISUAL DIRECTION] tags
  let postBody = "";
  let visualDirection = "";
  const tagPostMatch = rawText.match(/\[POST\]\s*([\s\S]*?)(?:\n\s*\[VISUAL DIRECTION\]|$)/i);
  const tagVisualMatch = rawText.match(/\[VISUAL DIRECTION\]\s*([\s\S]*)$/i);
  if (tagPostMatch?.[1]?.trim()) {
    postBody = tagPostMatch[1].trim();
    visualDirection = tagVisualMatch?.[1]?.trim() || "";
  } else {
    // Layer 1b: try markdown / bold variants
    const mdPostMatch = rawText.match(
      /(?:^|\n)\s*(?:#{1,6}\s*POST|\*\*POST\*\*|POST:)\s*\n([\s\S]*?)(?=\n\s*(?:#{1,6}\s*VISUAL DIRECTION|\*\*VISUAL DIRECTION\*\*|VISUAL DIRECTION:|\[VISUAL DIRECTION\])|$)/i,
    );
    const mdVisualMatch = rawText.match(
      /(?:^|\n)\s*(?:#{1,6}\s*VISUAL DIRECTION|\*\*VISUAL DIRECTION\*\*|VISUAL DIRECTION:|\[VISUAL DIRECTION\])\s*\n([\s\S]*)$/i,
    );
    if (mdPostMatch?.[1]?.trim()) {
      postBody = mdPostMatch[1].trim();
      visualDirection = mdVisualMatch?.[1]?.trim() || "";
    } else {
      // Layer 1c: strip-known-headers fallback over the entire raw text
      postBody = rawText;
    }
  }

  // Layer 1d: scrub known header lines & visual-direction field labels
  const headerPatterns = [
    /^\s*\[?\s*MEETING CLASSIFICATION\s*\]?\s*:?\s*$/i,
    /^\s*\[?\s*MEETING TYPE\s*\]?\s*:?.*$/i,
    /^\s*\[?\s*UNIVERSAL PATTERN\s*\]?\s*:?.*$/i,
    /^\s*\[?\s*SUGGESTED MOMENT FOR POST\s*\]?\s*:?\s*$/i,
    /^\s*\[?\s*POST\s*\]?\s*:?\s*$/i,
    /^\s*\[?\s*VISUAL DIRECTION\s*\]?\s*:?\s*$/i,
    /^\s*\[?\s*OVERLAY_TAG\s*\]?\s*:?\s*$/i,
    /^\s*\[?\s*IMAGE_DESCRIPTION\s*\]?\s*:?\s*$/i,
    /^\s*#{1,6}\s*MEETING.*$/i,
    /^\s*#{1,6}\s*POST\s*$/i,
    /^\s*#{1,6}\s*VISUAL DIRECTION\s*$/i,
    /^\s*\*\*\s*(?:POST|VISUAL DIRECTION|MEETING CLASSIFICATION|UNIVERSAL PATTERN|SUGGESTED MOMENT FOR POST)\s*\*\*\s*:?\s*$/i,
    /^\s*(?:ARCHETYPE|SUBJECT OF IMAGE|SUPPORTING OBJECTS|HEADLINE FOR GRAPHIC|MOOD|IMAGE FROM LIBRARY|BACKGROUND STYLE)\s*:.*$/i,
    /^\s*\*\*\s*(?:ARCHETYPE|SUBJECT OF IMAGE|SUPPORTING OBJECTS|HEADLINE FOR GRAPHIC|MOOD|IMAGE FROM LIBRARY|BACKGROUND STYLE)\s*\*\*\s*:.*$/i,
    /^\s*-{3,}\s*$/,
  ];

  // If we fell through to fallback (postBody === rawText), also drop everything from a visual-direction marker onward
  if (postBody === rawText) {
    const cutMatch = postBody.match(
      /(?:^|\n)\s*(?:\[VISUAL DIRECTION\]|#{1,6}\s*VISUAL DIRECTION|\*\*VISUAL DIRECTION\*\*|VISUAL DIRECTION:)/i,
    );
    if (cutMatch && typeof cutMatch.index === "number") {
      visualDirection = postBody.slice(cutMatch.index).replace(/^[\s\S]*?\n/, "").trim();
      postBody = postBody.slice(0, cutMatch.index);
    }
  }

  const cleanedLines = postBody
    .split("\n")
    .filter((line) => !headerPatterns.some((re) => re.test(line)));

  // Drop leading blank lines
  while (cleanedLines.length && cleanedLines[0].trim() === "") cleanedLines.shift();
  while (cleanedLines.length && cleanedLines[cleanedLines.length - 1].trim() === "") cleanedLines.pop();

  // Collapse 3+ consecutive blank lines to 2
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const line of cleanedLines) {
    if (line.trim() === "") {
      blankRun++;
      if (blankRun <= 2) collapsed.push(line);
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }

  return { caption: collapsed.join("\n").trim(), visualDirection };
}

function findBannedWords(text: string): string[] {
  const found: string[] = [];
  for (const { word } of BANNED_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(text)) found.push(word);
  }
  return found;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  timeoutMs: number,
) {
  return await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    },
    timeoutMs,
  );
}

function parseClaudeText(data: any): string {
  const blocks = data?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("");
}

async function auditAndRewrite(
  caption: string,
  apiKey: string,
): Promise<{ caption: string; rewritten: boolean; banned: string[] }> {
  const banned = findBannedWords(caption);
  if (banned.length === 0) return { caption, rewritten: false, banned: [] };

  console.warn("Banned words detected, attempting one-shot rewrite:", banned.join(", "));
  const replacementHints = BANNED_WORDS
    .filter((b) => banned.some((w) => w.toLowerCase() === b.word.toLowerCase()))
    .map((b) => `- "${b.word}" → "${b.replacement}"`)
    .join("\n");

  const sys = `You rewrite social media posts to remove banned words while preserving voice, structure, hook, CTA, and length. Output ONLY the rewritten post — no preamble, no labels, no markdown headings.`;
  const user = `Rewrite the post below, replacing every occurrence of these banned words with the suggested alternatives. Keep everything else identical (tone, line breaks, emoji, CTA).

Replacements:
${replacementHints}

POST:
${caption}`;

  try {
    const res = await callClaude(apiKey, sys, user, 1500, 30_000);
    if (!res.ok) {
      console.error("Audit rewrite call failed:", res.status);
      return { caption, rewritten: false, banned };
    }
    const data = await res.json();
    const rewrittenRaw = parseClaudeText(data);
    const { caption: cleaned } = extractCleanCaption(rewrittenRaw);
    if (cleaned && findBannedWords(cleaned).length === 0) {
      return { caption: cleaned, rewritten: true, banned };
    }
    return { caption, rewritten: false, banned };
  } catch (e) {
    console.error("Audit rewrite exception:", e);
    return { caption, rewritten: false, banned };
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

Respond with the [POST] block and [VISUAL DIRECTION] block as specified.${OUTPUT_RULES_BLOCK}`;

    const systemPrompt = extraContext
      ? `${captionPrompt}\n\n---\nADDITIONAL BRAND CONTEXT:\n${extraContext}`
      : captionPrompt;

    let captionRaw = "";
    try {
      const res = await callClaude(ANTHROPIC_API_KEY, systemPrompt, userMessage, 1500, 45_000);

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
      captionRaw = parseClaudeText(data);
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

    // Layered extraction (handles [POST], # POST, **POST**, fallback strip)
    const { caption: extractedCaption } = extractCleanCaption(captionRaw);
    let newCaption = extractedCaption;

    if (!newCaption) {
      return new Response(JSON.stringify({ error: "Empty caption returned — retry" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Banned-word audit + one-shot rewrite
    const auditResult = await auditAndRewrite(newCaption, ANTHROPIC_API_KEY);
    newCaption = auditResult.caption;
    if (auditResult.banned.length > 0) {
      console.log(
        `Audit: banned words ${auditResult.banned.join(", ")} — ${auditResult.rewritten ? "rewritten" : "rewrite failed, keeping original"}`,
      );
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
