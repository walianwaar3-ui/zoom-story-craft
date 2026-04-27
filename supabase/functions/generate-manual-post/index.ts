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
- NEVER use real first or last names of clients, team members, or anyone mentioned in the input. Refer to them as "a founder", "an operator", "a coach", or generic archetype labels.
- NEVER name specific third-party tools/brands (GoHighLevel, ClickFunnels, Kajabi, HubSpot, Zapier, ActiveCampaign, Calendly, ManyChat, etc.). Use generic terms: "their CRM", "their funnel builder", "their automation stack", "their email platform", "their booking tool".
- The post must read as a universal lesson — anyone could be the subject. No proper nouns identifying a specific client or vendor.`;

function findCapitalizedNameMentions(text: string): string[] {
  // Heuristic: 2-word capitalized sequences NOT at sentence start, excluding allowlist & all-caps acronyms
  const found = new Set<string>();
  const re = /(?<=[a-z,;:"'\)\s])([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    if (!NAME_ALLOWLIST.has(name) && !name.split(/\s+/).every((p) => NAME_ALLOWLIST.has(p))) {
      found.add(name);
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

function handleClaudeError(status: number, corsHeaders: Record<string, string>) {
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
  return null;
}

function parseClaudeTextModule(data: any): string {
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
): Promise<{ caption: string; rewritten: boolean; banned: string[]; names: string[]; brands: string[] }> {
  const banned = findBannedWords(caption);
  const names = findCapitalizedNameMentions(caption);
  const brands = findToolBrandMentions(caption);

  if (banned.length === 0 && names.length === 0 && brands.length === 0) {
    return { caption, rewritten: false, banned: [], names: [], brands: [] };
  }

  const issues: string[] = [];
  if (banned.length) issues.push(`banned: ${banned.join(", ")}`);
  if (names.length) issues.push(`names: ${names.join(", ")}`);
  if (brands.length) issues.push(`brands: ${brands.map((b) => b.brand).join(", ")}`);
  console.warn("Audit issues detected, attempting one-shot rewrite:", issues.join(" | "));

  const replacementLines: string[] = [];
  for (const b of BANNED_WORDS) {
    if (banned.some((w) => w.toLowerCase() === b.word.toLowerCase())) {
      replacementLines.push(`- "${b.word}" → "${b.replacement}"`);
    }
  }
  for (const name of names) {
    replacementLines.push(`- "${name}" (real name) → "a founder" / "an operator" — never use the real name`);
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
      return { caption, rewritten: false, banned, names, brands };
    }
    const data = await res.json();
    const rewrittenRaw = parseClaudeTextModule(data);
    const { caption: cleaned } = extractCleanCaption(rewrittenRaw);
    if (
      cleaned &&
      findBannedWords(cleaned).length === 0 &&
      findCapitalizedNameMentions(cleaned).length === 0 &&
      findToolBrandMentions(cleaned).length === 0
    ) {
      return { caption: cleaned, rewritten: true, banned, names, brands };
    }
    return { caption, rewritten: false, banned, names, brands };
  } catch (e) {
    console.error("Audit rewrite exception:", e);
    return { caption, rewritten: false, banned, names, brands };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const form = await req.json();
    const {
      post_date,
      post_type,
      hook,
      context,
      cta_goal,
      image_style,
      aspect_ratio,
      transcript_id,
    } = form || {};

    if (!post_date || !post_type || !hook || !String(hook).trim()) {
      return new Response(
        JSON.stringify({ error: "post_date, post_type and hook are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all KB entries
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

    const parseClaudeText = (data: any): string => {
      const blocks = data?.content;
      if (!Array.isArray(blocks)) return "";
      return blocks
        .filter((b: any) => b?.type === "text" && typeof b.text === "string")
        .map((b: any) => b.text)
        .join("");
    };

    // ============================================================
    // STEP 1: Format Input via "Manual Input Formatter"
    // ============================================================
    const formatterPrompt = getPrompt("Manual Input Formatter", "manual input formatter");
    if (!formatterPrompt) {
      return new Response(
        JSON.stringify({ error: "No 'Manual Input Formatter' entry in knowledgebase." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formatterUser = JSON.stringify({
      post_date,
      post_type,
      hook,
      context: context || "",
      cta_goal: cta_goal && cta_goal !== "auto" ? cta_goal : "auto-pick",
      image_style: image_style && image_style !== "auto" ? image_style : "auto",
      aspect_ratio: aspect_ratio || "1:1",
    }, null, 2);

    let formattedBrief = "";
    try {
      const formatterRes = await callClaude(ANTHROPIC_API_KEY, formatterPrompt, formatterUser, 600, 20_000);
      if (!formatterRes.ok) {
        const errResp = handleClaudeError(formatterRes.status, corsHeaders);
        if (errResp) return errResp;
        const t = await formatterRes.text();
        console.error("Formatter Claude error:", formatterRes.status, t);
        return new Response(JSON.stringify({ error: "Failed to format input" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await formatterRes.json();
      const raw = parseClaudeText(data);
      const briefMatch = raw.match(/\[MANUAL POST BRIEF\]\s*([\s\S]*)$/i);
      formattedBrief = (briefMatch?.[1] || raw).trim();

      if (/INSUFFICIENT INPUT/i.test(formattedBrief) || /INSUFFICIENT INPUT/i.test(raw)) {
        return new Response(
          JSON.stringify({ error: "Insufficient input — please add more detail to the Hook or Context fields." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      console.error("Formatter exception:", e);
      const isTimeout = e instanceof Error && e.name === "AbortError";
      return new Response(
        JSON.stringify({ error: isTimeout ? "Input formatting timed out — retry" : "Input formatting failed — retry" }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // STEP 2: Generate Caption
    // ============================================================
    const baseCaptionPrompt = getPrompt("Caption Prompt", "Master", "Master Prompt", "MASTER PROMPT");
    if (!baseCaptionPrompt) {
      return new Response(
        JSON.stringify({ error: "No 'Caption Prompt' entry in knowledgebase." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const captionSystemPrompt = baseCaptionPrompt + kbContext;

    const captionUserPrompt = formattedBrief + OUTPUT_RULES_BLOCK;
    const captionRes = await callClaude(ANTHROPIC_API_KEY, captionSystemPrompt, captionUserPrompt, 1500, 60_000);
    if (!captionRes.ok) {
      const errResp = handleClaudeError(captionRes.status, corsHeaders);
      if (errResp) return errResp;
      const errText = await captionRes.text();
      console.error("Caption Claude error:", captionRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to generate caption" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const captionData = await captionRes.json();
    const rawCaption = parseClaudeText(captionData);
    const { caption: extractedCaption, visualDirection } = extractCleanCaption(rawCaption);
    const auditResult = await auditAndRewrite(extractedCaption, ANTHROPIC_API_KEY);
    const caption = auditResult.caption;
    if (auditResult.banned.length > 0 || auditResult.names.length > 0 || auditResult.brands.length > 0) {
      const parts: string[] = [];
      if (auditResult.banned.length) parts.push(`banned: ${auditResult.banned.join(", ")}`);
      if (auditResult.names.length) parts.push(`names: ${auditResult.names.join(", ")}`);
      if (auditResult.brands.length) parts.push(`brands: ${auditResult.brands.map((b) => b.brand).join(", ")}`);
      console.log(
        `Manual post audit — ${parts.join(" | ")} — ${auditResult.rewritten ? "rewritten" : "rewrite failed, keeping original"}`,
      );
    }

    // ============================================================
    // STEP 3: Build image prompt via "Image Prompt Builder"
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

      const styleHint = image_style && image_style !== "auto" ? `\nIMAGE STYLE PREFERENCE: ${image_style}` : "";
      const builderUser = `CAPTION:\n${caption}\n\n[VISUAL DIRECTION]\n${visualDirection || "(none provided)"}${styleHint}\n\nASPECT RATIO: ${aspect_ratio || "1:1"}`;

      try {
        const builderRes = await callClaude(ANTHROPIC_API_KEY, builderSystem, builderUser, 800, 30_000);
        if (!builderRes.ok) {
          const errResp = handleClaudeError(builderRes.status, corsHeaders);
          if (errResp) return errResp;
          const errText = await builderRes.text();
          console.error("Image prompt builder failed:", builderRes.status, errText);
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
      const hookLine = caption.split("\n").find((l: string) => l.trim().length > 0) || hook;
      imagePrompt = [
        `High-contrast social media graphic, ${aspect_ratio || "1:1"}.`,
        `Hook: ${hookLine.slice(0, 80)}.`,
        visualDirection ? `Visual direction: ${visualDirection.slice(0, 200)}` : null,
        "Use the overlay photo as main subject. Clean typography, professional layout.",
      ].filter(Boolean).join(" ");
    }

    // ============================================================
    // STEP 4: Generate image with fal.ai (60s polling)
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
          if (!imageUrl) console.error("fal.ai polling timed out within 60s window");
        }
      } catch (falErr) {
        console.error("fal.ai error:", falErr);
      }
    }

    // ============================================================
    // STEP 5: Save
    // ============================================================
    const { data: content, error: insertError } = await supabaseAdmin
      .from("generated_content")
      .insert({
        transcript_id: null,
        caption,
        image_url: imageUrl,
        image_prompt: imagePrompt,
        aspect_ratio: aspect_ratio || "1:1",
        status: imageUrl ? "complete" : "text_only",
        source: "manual",
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

    return new Response(
      JSON.stringify({
        success: true,
        content_id: content.id,
        caption,
        image_url: imageUrl,
        warning: llmBuilderError || (imageUrl ? null : "Image generation failed — caption saved only"),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Generate manual error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
