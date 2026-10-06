import { ApiError, handler, json } from "@/lib/hermes/server";
import { datePreset, metaSnapshot } from "@/lib/hermes/meta";

const MODEL = process.env.AGENT_MODEL || "deepseek/deepseek-v4-pro";

const PROMPT = `You are the Meta Ads analyst for Wali Digital Consulting, a growth consultancy for coaches,
consultants and service businesses. Write a short performance report in Markdown from the data provided.

Rules:
- Use only the numbers in the data. If something can't be judged from it (e.g. no leads tracked), say so.
- Diagnose before recommending: name the likely cause behind each finding.
- Money in the account currency. Round sensibly.
- No filler, no emoji, no em dashes. Under 350 words.

Structure:
## Summary
Two or three sentences: spend, results, cost per lead, and the one thing that matters most.
## What's working
## What's not
## Recommended actions
Numbered, most important first, each with the expected effect. Budget or creative changes need Wali's approval.`;

/**
 * GET /api/hermes/meta/report?date_preset=last_7d
 * AI-written Markdown report on the Meta account, grounded in /meta/kpis data.
 * Auth: the Hermes key, or a signed-in Wali OS user.
 */
export const GET = handler(
  async (_db, req) => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new ApiError(503, "OPENROUTER_API_KEY not set");
    const snapshot = await metaSnapshot(datePreset(new URL(req.url).searchParams.get("date_preset")));

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://wali-os.vercel.app",
        "X-Title": "Wali OS",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: `Meta Ads data (${snapshot.date_preset}):\n${JSON.stringify(snapshot)}` },
        ],
      }),
    });
    if (!res.ok) {
      console.error("openrouter meta report", res.status, await res.text());
      throw new ApiError(502, `The AI service returned an error (${res.status})`);
    }
    const data = await res.json();
    return json({
      report: String(data.choices?.[0]?.message?.content ?? "").trim(),
      date_preset: snapshot.date_preset,
      account: snapshot.account,
      generated_at: new Date().toISOString(),
    });
  },
  { allowUser: true }
);
