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

// Names that are allowed to appear (brand assets, not client names)
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
- NEVER use real first or last names of clients, team members, or anyone mentioned in the transcript. Refer to them as "a founder", "an operator", "a coach", or use the archetype label provided in the brief.
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

function extractCleanCaption(rawText: string): { caption: string; visualDirection: string } {
  if (!rawText) return { caption: "", visualDirection: "" };
  let postBody = "";
  let visualDirection = "";
  const tagPostMatch = rawText.match(/\[POST\]\s*([\s\S]*?)(?:\n\s*\[VISUAL DIRECTION\]|$)/i);
  const tagVisualMatch = rawText.match(/\[VISUAL DIRECTION\]\s*([\s\S]*)$/i);
  if (tagPostMatch?.[1]?.trim()) {
    postBody = tagPostMatch[1].trim();
    visualDirection = tagVisualMatch?.[1]?.trim() || "";
  } else {
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
      postBody = rawText;
    }
  }

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
  while (cleanedLines.length && cleanedLines[0].trim() === "") cleanedLines.shift();
  while (cleanedLines.length && cleanedLines[cleanedLines.length - 1].trim() === "") cleanedLines.pop();

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

async function auditAndRewrite(
  caption: string,
  apiKey: string,
  clientName?: string | null,
  archetype?: string | null,
): Promise<{ caption: string; rewritten: boolean; banned: string[]; names: string[]; brands: string[] }> {
  const banned = findBannedWords(caption);
  const names = findClientNameMentions(caption, clientName);
  const brands = findToolBrandMentions(caption);

  if (banned.length === 0 && names.length === 0 && brands.length === 0) {
    return { caption, rewritten: false, banned: [], names: [], brands: [] };
  }

  const issues: string[] = [];
  if (banned.length) issues.push(`banned words: ${banned.join(", ")}`);
  if (names.length) issues.push(`client names: ${names.join(", ")}`);
  if (brands.length) issues.push(`tool brands: ${brands.map((b) => b.brand).join(", ")}`);
  console.warn("Audit issues detected, attempting one-shot rewrite:", issues.join(" | "));

  const replacementLines: string[] = [];
  for (const b of BANNED_WORDS) {
    if (banned.some((w) => w.toLowerCase() === b.word.toLowerCase())) {
      replacementLines.push(`- "${b.word}" → "${b.replacement}"`);
    }
  }
  for (const name of names) {
    replacementLines.push(`- "${name}" (real name) → "${archetype || "a founder"}" or "they / them" — never use the real name`);
  }
  for (const tb of brands) {
    replacementLines.push(`- "${tb.brand}" (specific tool) → "${tb.replacement}"`);
  }

  const sys = `You rewrite social media posts to anonymize them while preserving voice, structure, hook, CTA, and length. Output ONLY the rewritten post — no preamble, no labels, no markdown headings.`;
  const user = `Rewrite the post below, applying ALL of the following replacements exactly. Keep everything else identical (tone, line breaks, emoji, CTA, length).

Replacements:
${replacementLines.join("\n")}

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript_id, custom_prompt, aspect_ratio, post_count } = await req.json();

    if (!transcript_id) {
      return new Response(
        JSON.stringify({ error: "transcript_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clamp post count between 1 and 14
    const requestedCount = Number.isFinite(Number(post_count)) ? Math.floor(Number(post_count)) : 1;
    const totalPosts = Math.max(1, Math.min(14, requestedCount));

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Fetch all knowledgebase entries ---
    const { data: kbEntries } = await supabaseAdmin
      .from("knowledgebase")
      .select("category, title, content");

    const kbMap: Record<string, string> = {};
    const kbByCategory: Record<string, string[]> = {};
    for (const entry of kbEntries || []) {
      if (!kbMap[entry.category]) kbMap[entry.category] = entry.content;
      if (!kbMap[entry.title]) kbMap[entry.title] = entry.content;
      if (!kbMap[entry.category.toLowerCase()]) kbMap[entry.category.toLowerCase()] = entry.content;
      if (!kbMap[entry.title.toLowerCase()]) kbMap[entry.title.toLowerCase()] = entry.content;
      if (!kbByCategory[entry.category]) kbByCategory[entry.category] = [];
      kbByCategory[entry.category].push(`[${entry.title}]: ${entry.content}`);
    }

    const getPrompt = (...keys: string[]) => {
      for (const key of keys) {
        if (kbMap[key]) return kbMap[key];
        if (kbMap[key.toLowerCase()]) return kbMap[key.toLowerCase()];
      }
      return null;
    };

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
    const kbContext = contextParts.length
      ? "\n\nADDITIONAL CONTEXT FROM KNOWLEDGEBASE:\n" + contextParts.join("\n\n")
      : "";

    // ============================================================
    // STEP 1: Generate Caption (looped for batch generation)
    // ============================================================
    const baseCaptionPrompt = getPrompt("Caption Prompt", "Master", "Master Prompt", "MASTER PROMPT");
    if (!baseCaptionPrompt) {
      return new Response(
        JSON.stringify({ error: "No caption prompt source found in knowledgebase. Add a 'Caption Prompt' or 'Master' entry." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const captionSystemPrompt = baseCaptionPrompt + kbContext;

    // ============================================================
    // STEP 1a: PLAN — for batches, generate N distinct angles upfront
    // ============================================================
    type Angle = { index: number; angle: string; hook: string; theme: string; quote: string };
    let plannedAngles: Angle[] = [];

    if (totalPosts > 1) {
      const planSystem = `You are a content strategist planning a ${totalPosts}-post social series from a single sales/coaching call transcript.

Your job: extract ${totalPosts} DISTINCT angles — each angle must focus on a different insight, story beat, objection, framework, quote, or lesson from the transcript. No two angles may overlap in core message or theme.

OUTPUT FORMAT — respond with EXACTLY a valid JSON array, no prose, no markdown fences:
[
  {
    "index": 1,
    "angle": "<one-sentence description of what this post is about>",
    "hook": "<a draft opening line, max 120 chars, distinct from all other hooks>",
    "theme": "<2-4 word category, e.g. 'pricing objection', 'discovery question', 'mindset shift', 'closing technique'>",
    "quote": "<a short verbatim or paraphrased line from the transcript that anchors this angle, or empty string if none>"
  },
  ...
]

Rules:
- Exactly ${totalPosts} entries.
- Every "theme" must be unique across the array.
- Every "hook" must be unique and not paraphrase another.
- If the transcript only contains M < ${totalPosts} genuinely distinct ideas, still produce ${totalPosts} entries by varying the FORMAT (story vs. list vs. contrarian take vs. question vs. quote breakdown vs. behind-the-scenes) of the same theme — but mark theme with a suffix like "pricing objection (story)" vs "pricing objection (list)" so downstream knows.
- Order angles from strongest hook → supporting content.`;

      const planUser = `TRANSCRIPT METADATA:
Meeting: ${transcript.meeting_topic}
Client: ${transcript.client_name || "N/A"}
Summary: ${transcript.summary || "N/A"}
Key Issues: ${transcript.issues_discussed || "N/A"}

FULL TRANSCRIPT:
${(transcript.transcript || "").slice(0, 8000)}

Produce the JSON array of ${totalPosts} distinct angles now.`;

      const planRes = await callClaude(ANTHROPIC_API_KEY, planSystem, planUser, 4000, 90_000);

      if (!planRes.ok) {
        const errResp = handleClaudeError(planRes.status);
        if (errResp) return errResp;
        const errText = await planRes.text();
        console.error("Angle planning failed:", planRes.status, errText);
        return new Response(
          JSON.stringify({ error: "Failed to plan post angles. Try again or reduce post count." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const planData = await planRes.json();
      const planText = parseClaudeText(planData).trim();

      // Strip markdown fences if Claude added them despite instructions
      const cleaned = planText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Not a non-empty array");
        plannedAngles = parsed.slice(0, totalPosts).map((a: any, i: number) => ({
          index: i + 1,
          angle: String(a.angle || "").trim(),
          hook: String(a.hook || "").trim(),
          theme: String(a.theme || "").trim(),
          quote: String(a.quote || "").trim(),
        }));
        // Pad if Claude returned fewer than requested (rare)
        while (plannedAngles.length < totalPosts) {
          plannedAngles.push({
            index: plannedAngles.length + 1,
            angle: `Additional insight from the call (post ${plannedAngles.length + 1})`,
            hook: "",
            theme: `extra-${plannedAngles.length + 1}`,
            quote: "",
          });
        }
        console.log(`Planned ${plannedAngles.length} angles:`, plannedAngles.map(a => `${a.index}. [${a.theme}] ${a.angle.slice(0, 60)}`).join(" | "));
      } catch (e) {
        console.error("Failed to parse planning JSON:", e, "raw:", planText.slice(0, 500));
        return new Response(
          JSON.stringify({ error: "Angle planner returned invalid JSON. Try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const results: Array<{ content_id: string; caption: string; image_url: string | null; warning: string | null }> = [];
    const errors: string[] = [];
    const previousHooks: string[] = [];
    const previousThemes: string[] = [];

    for (let postIndex = 1; postIndex <= totalPosts; postIndex++) {
      const assignedAngle = plannedAngles[postIndex - 1];

      const variationHint = totalPosts > 1 && assignedAngle
        ? `\n\n=== ASSIGNED ANGLE FOR THIS POST (${postIndex} of ${totalPosts}) ===
Angle: ${assignedAngle.angle}
Theme: ${assignedAngle.theme}
${assignedAngle.hook ? `Suggested hook direction: ${assignedAngle.hook}` : ""}
${assignedAngle.quote ? `Anchor quote/line from transcript: "${assignedAngle.quote}"` : ""}

You MUST write this post about the assigned angle above and nothing else. Do NOT drift into other angles from this transcript — those are reserved for other posts in the series.${previousThemes.length ? `\n\nThemes already covered (do NOT repeat or overlap): ${previousThemes.join("; ")}` : ""}${previousHooks.length ? `\n\nHooks already used (do NOT paraphrase):\n${previousHooks.map((h, i) => `${i + 1}. ${h}`).join("\n")}` : ""}`
        : "";

      const baseUser = custom_prompt
        ? `${custom_prompt}\n\nMeeting: ${transcript.meeting_topic}\nClient: ${transcript.client_name || "N/A"}\nSummary: ${transcript.summary || "N/A"}\nIssues: ${transcript.issues_discussed || "N/A"}\nTranscript excerpt: ${(transcript.transcript || "").slice(0, 3000)}`
        : `Meeting: ${transcript.meeting_topic}\nClient: ${transcript.client_name || "N/A"}\nSummary: ${transcript.summary || "N/A"}\nKey Issues: ${transcript.issues_discussed || "N/A"}\nTranscript: ${(transcript.transcript || "").slice(0, 3000)}`;

      const captionUserPrompt = baseUser + variationHint + OUTPUT_RULES_BLOCK;

      const captionResponse = await callClaude(ANTHROPIC_API_KEY, captionSystemPrompt, captionUserPrompt, 1500, 60_000);

      if (!captionResponse.ok) {
        const errResp = handleClaudeError(captionResponse.status);
        // For batch, only abort the whole request on first post; otherwise log & continue
        if (errResp && postIndex === 1) return errResp;
        const errText = await captionResponse.text();
        console.error(`Caption generation error (post ${postIndex}):`, captionResponse.status, errText);
        errors.push(`Post ${postIndex}: caption failed (HTTP ${captionResponse.status})`);
        continue;
      }

      const captionData = await captionResponse.json();
      const rawCaption = parseClaudeText(captionData);
      const { caption: extractedCaption, visualDirection } = extractCleanCaption(rawCaption);

      // Banned-word audit + one-shot rewrite
      const auditResult = await auditAndRewrite(extractedCaption, ANTHROPIC_API_KEY);
      const caption = auditResult.caption;
      if (auditResult.banned.length > 0) {
        console.log(
          `Post ${postIndex} audit: banned words ${auditResult.banned.join(", ")} — ${auditResult.rewritten ? "rewritten" : "rewrite failed, keeping original"}`,
        );
      }

      // Track first non-empty line as the "hook" + assigned theme so future posts don't repeat
      const firstLine = caption.split("\n").find((l: string) => l.trim().length > 0)?.trim() || "";
      if (firstLine) previousHooks.push(firstLine.slice(0, 140));
      if (assignedAngle?.theme) previousThemes.push(assignedAngle.theme);

      // ============================================================
      // STEP 2: Build the fal.ai prompt via LLM (Image Prompt Builder)
      // ============================================================
      const imagePromptBuilder = getPrompt(
        "Image Prompt Builder",
        "Image Prompt",
        "image prompt builder",
        "image prompt"
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

        const builderUser = `CAPTION:\n${caption}\n\n[VISUAL DIRECTION]\n${visualDirection || "(none provided)"}\n\nASPECT RATIO: ${aspect_ratio || "1:1"}`;

        try {
          const builderRes = await callClaude(ANTHROPIC_API_KEY, builderSystem, builderUser, 800, 30_000);

          if (!builderRes.ok) {
            const errResp = handleClaudeError(builderRes.status);
            if (errResp && postIndex === 1) return errResp;
            const errText = await builderRes.text();
            console.error(`Image prompt builder failed (post ${postIndex}):`, builderRes.status, errText);
            llmBuilderError = `LLM error ${builderRes.status}`;
          } else {
            const builderData = await builderRes.json();
            const raw = parseClaudeText(builderData);
            const tagMatch = raw.match(/\[OVERLAY_TAG\]\s*([\s\S]*?)(?:\n\s*\[IMAGE_DESCRIPTION\]|$)/i);
            const descMatch = raw.match(/\[IMAGE_DESCRIPTION\]\s*([\s\S]*)$/i);
            overlayTag = tagMatch?.[1]?.trim() || "";
            imageDescription = descMatch?.[1]?.trim() || "";

            if (!overlayTag || !imageDescription) {
              console.error("Image prompt builder returned invalid format:", raw);
              llmBuilderError = "Image description generation failed — retry";
            } else {
              const tagLower = overlayTag.toLowerCase();
              const matched =
                overlays.find((o: any) => o.title?.toLowerCase() === tagLower) ||
                overlays.find((o: any) =>
                  o.title?.toLowerCase().includes(tagLower) || tagLower.includes(o.title?.toLowerCase())
                );
              selectedPhoto = (matched || overlays[Math.floor(Math.random() * overlays.length)]).image_url;
              imagePrompt = imageDescription;
            }
          }
        } catch (e) {
          console.error("Image prompt builder exception:", e);
          llmBuilderError = e instanceof Error && e.name === "AbortError"
            ? "Image description generation timed out — retry"
            : "Image description generation failed — retry";
        }
      } else {
        selectedPhoto = overlays.length
          ? overlays[Math.floor(Math.random() * overlays.length)].image_url
          : null;
        const hookLine = caption.split("\n").find((l: string) => l.trim().length > 0) || transcript.meeting_topic;
        imagePrompt = [
          `High-contrast social media graphic, ${aspect_ratio || "1:1"}.`,
          `Hook: ${hookLine.slice(0, 80)}.`,
          visualDirection ? `Visual direction: ${visualDirection.slice(0, 200)}` : null,
          "Use the overlay photo as main subject. Clean typography, professional layout.",
        ]
          .filter(Boolean)
          .join(" ");
      }

      // ============================================================
      // STEP 3: Generate image with fal.ai (60s timeout)
      // ============================================================
      let imageUrl: string | null = null;
      const FAL_KEY = Deno.env.get("FAL_KEY");

      if (FAL_KEY && selectedPhoto && imagePrompt && !llmBuilderError) {
        const sizeMap: Record<string, { width: number; height: number }> = {
          "1:1": { width: 1024, height: 1024 },
          "9:16": { width: 768, height: 1344 },
          "16:9": { width: 1344, height: 768 },
          "4:5": { width: 896, height: 1120 },
        };
        const imageSize = sizeMap[aspect_ratio || "1:1"] || sizeMap["1:1"];

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
            15_000
          );

          if (!submitRes.ok) {
            console.error("fal.ai submit failed:", submitRes.status, await submitRes.text());
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
                console.error("fal.ai generation failed:", statusData);
                break;
              }
            }
            if (!imageUrl) {
              console.error("fal.ai polling timed out within 60s window");
            }
          }
        } catch (falErr) {
          console.error("fal.ai error:", falErr);
        }
      } else {
        if (!FAL_KEY) console.error("FAL_KEY not configured");
        if (!selectedPhoto) console.error("No overlay photo available");
        if (llmBuilderError) console.error("Skipping fal.ai due to builder error:", llmBuilderError);
      }

      // ============================================================
      // STEP 4: Save to generated_content
      // ============================================================
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
        console.error(`Insert error (post ${postIndex}):`, insertError);
        errors.push(`Post ${postIndex}: save failed`);
        continue;
      }

      results.push({
        content_id: content.id,
        caption,
        image_url: imageUrl,
        warning: llmBuilderError || (imageUrl ? null : "Image generation failed — caption saved only"),
      });
    }
    // end batch loop

    // Mark transcript as used if we produced at least one post
    if (results.length > 0) {
      await supabaseAdmin
        .from("zoom_transcripts")
        .update({ status: "used" })
        .eq("id", transcript_id);
    }

    if (results.length === 0) {
      return new Response(
        JSON.stringify({ error: "All post generations failed", details: errors }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Backwards-compatible response: include first post at top level + full array
    const first = results[0];
    return new Response(
      JSON.stringify({
        success: true,
        total_posts: results.length,
        requested_count: totalPosts,
        posts: results,
        errors: errors.length ? errors : undefined,
        // legacy single-post fields (first post)
        content_id: first.content_id,
        caption: first.caption,
        image_url: first.image_url,
        warning: first.warning,
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
