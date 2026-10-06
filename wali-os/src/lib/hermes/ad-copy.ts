/**
 * Copywriting rules for the Ads Planner: a visceral hook, pattern tension and a
 * human voice. The craft lives in COPY_RULES (system prompt); checkAdCopy()
 * enforces the mechanical part server-side so AI-sounding copy never reaches
 * Wali's approval card. Pure, no imports: safe for tests and client code.
 */

export const COPY_RULES = [
  "Copywriting (strict):",
  "- Visceral hook: the first line drops the reader into a moment they've lived, in their own words. A scene, a number, a time of day, a feeling in the body. Max 14 words. Not a question, not a claim about you.",
  "  Good: \"It's 11pm and you're still answering DMs that never turn into calls.\"  Bad: \"Are you struggling to get clients?\"",
  "- Pattern tension: break a belief the reader holds. Name what they think is the problem, then show the real one (\"You don't have a lead problem. You have a follow-up problem.\"). Open the loop in the hook, close it only at the CTA.",
  "- Human voice: write like Wali talking to one coach over coffee. First person, contractions, short sentences, plain words, real specifics (numbers, days, GoHighLevel). One idea per line.",
  "- Never: em or en dashes, emoji, hashtags, more than one exclamation mark, or AI/corporate words (unlock, elevate, game-changer, seamless, leverage, revolutionize, supercharge, skyrocket, unleash, \"next level\", \"in today's fast-paced world\", \"look no further\").",
  "- Headline: max 40 characters, the outcome in plain words. Body: 40 to 120 words.",
  "- create_ad needs `tension`: the belief this ad breaks, in one line. If create_ad returns copy errors, rewrite and call it again.",
].join("\n");

const BANNED = [
  "unlock",
  "elevate",
  "game-changer",
  "game changer",
  "seamless",
  "seamlessly",
  "leverage",
  "revolutionize",
  "revolutionise",
  "supercharge",
  "skyrocket",
  "unleash",
  "next level",
  "fast-paced",
  "look no further",
  "transformative",
  "empower",
  "synergy",
  "cutting-edge",
  "in today's world",
  "dive in",
  "harness",
];

const QUESTION_OPENERS = /^(are you|do you|have you( ever)?|did you know|tired of|struggling (to|with)|want to|ready to|imagine|what if)\b/i;
// Pictographs and symbol emoji; plain punctuation and accents stay allowed.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** Problems a rewrite must fix. Empty array = the copy passes. */
export function checkAdCopy(copy: { hook: string; body: string; headline: string; description?: string | null }): string[] {
  const all = [copy.hook, copy.body, copy.headline, copy.description ?? ""].join("\n");
  const lower = all.toLowerCase();
  const problems: string[] = [];

  if (/[—–]/.test(all)) problems.push("Remove em/en dashes (— –). Use a full stop or comma.");
  if (EMOJI.test(all)) problems.push("Remove emoji.");
  if (/(^|\s)#\w/.test(all)) problems.push("Remove hashtags.");
  if ((all.match(/!/g) ?? []).length > 1) problems.push("Use at most one exclamation mark.");
  const found = BANNED.filter((w) => new RegExp(`\\b${w.replace(/[-']/g, (c) => `\\${c}`)}`, "i").test(lower));
  if (found.length) problems.push(`Cut AI/corporate words: ${found.join(", ")}. Say it plainly.`);

  const hookWords = words(copy.hook).length;
  if (hookWords > 14) problems.push(`Hook is ${hookWords} words; max 14. Make it one sharp, lived moment.`);
  if (QUESTION_OPENERS.test(copy.hook.trim()) || copy.hook.trim().endsWith("?"))
    problems.push('Hook must not be a question or a stock opener ("Are you…", "Tired of…", "Imagine…"). Drop the reader into a real moment.');

  if (copy.headline.length > 40) problems.push(`Headline is ${copy.headline.length} characters; max 40.`);
  const bodyWords = words(copy.body).length;
  if (bodyWords < 40 || bodyWords > 120) problems.push(`Body is ${bodyWords} words; keep it 40 to 120.`);

  return problems;
}
