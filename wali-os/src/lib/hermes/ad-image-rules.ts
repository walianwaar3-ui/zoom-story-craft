/**
 * Rules for Ads Planner image generation. Every creative must show real people
 * (the coach, consultant or their clients) as the main subject: no empty desks,
 * empty offices or objects-only scenes. Enforced here, server-side, so the
 * model can't skip it.
 */

/** Words that show a person is in the shot. Hands alone don't count. */
const PEOPLE =
  /\b(person|people|man|men|woman|women|guy|lady|coach(es)?|consultant(s)?|client(s)?|founder(s)?|entrepreneur(s)?|owner(s)?|speaker(s)?|team(s)?|colleague(s)?|couple|group|crowd|audience|attendee(s)?|student(s)?|mentor(s)?|leader(s)?|executive(s)?|professional(s)?|someone|portrait|face(s)?|smiling|laughing)\b/i;

/** Scenes that are empty by definition, even if a person is mentioned elsewhere. */
const EMPTY_SCENE =
  /\b(empty|unoccupied|deserted|vacant|no (people|person|one|humans?)|without (people|a person|anyone|humans?)|nobody|flat[ -]?lay|still life|product shot|objects? only)\b/i;

export const IMAGE_RULES = [
  "Image rules (strict):",
  "- Every image shows real people as the main subject: the coach or consultant, their clients, or both, in a believable moment (coaching call, workshop, 1:1 session, celebrating a result, speaking to camera).",
  "- Faces visible, natural expressions, eye contact or clear action. People fill a large part of the frame.",
  "- Never an empty desk, empty office, empty room, laptop on a table, or objects-only / flat-lay scene. Hands-only shots don't count as people.",
  "- Photorealistic, natural light, authentic (not stock-photo stiff). Little or no text in the image.",
].join("\n");

export class ImageRuleError extends Error {}

/**
 * Check the model's prompt and build the one sent to Fal. Throws ImageRuleError
 * with a message the model can act on when the shot has no people or is an
 * empty scene.
 */
export function buildAdImagePrompt(people: string, prompt: string) {
  const who = people.trim();
  const scene = prompt.trim();
  if (!who) throw new ImageRuleError('"people" is required: describe who is in the shot and what they are doing.');
  if (!PEOPLE.test(who)) throw new ImageRuleError(`"people" must describe actual people (e.g. "a female coach in her 40s on a video call with a smiling client"), got: "${who.slice(0, 120)}"`);
  if (EMPTY_SCENE.test(who) || EMPTY_SCENE.test(scene))
    throw new ImageRuleError("Empty scenes are not allowed (empty desk/office/room, no people, flat lay, objects only). Rewrite the prompt with people as the main subject.");
  return [
    `${who}.`,
    scene.endsWith(".") ? scene : `${scene}.`,
    "The people are the clear main subject, in sharp focus, faces visible with natural, genuine expressions, filling a large part of the frame.",
    "Photorealistic, natural light, authentic candid moment. Not an empty desk, not an empty office, not an objects-only scene. Minimal or no text.",
  ].join(" ");
}

/**
 * Real photos of Wali and real clients beat AI people, so new concepts reuse
 * the winning ad's image by default. AI images only when Wali's message asks
 * for them in so many words ("generate images", "AI photos", ...).
 */
const ASKS_FOR_AI = [
  /\bgenerat\w*\b[^.?!\n]{0,40}\b(images?|photos?|pictures?|creatives?|visuals?)\b/i,
  /\b(images?|photos?|pictures?|creatives?|visuals?)\b[^.?!\n]{0,20}\bgenerat\w*/i,
  /\bai[- ]?(generated[- ])?(images?|photos?|pictures?|creatives?|visuals?)\b/i,
];

export function asksForAiImages(message: string) {
  return ASKS_FOR_AI.some((re) => re.test(message));
}

export const REUSE_RULES = [
  "Creatives (strict):",
  "- Default: reuse the winning ad's real image (reuse_ad_image). Real photos of Wali and real clients convert better than AI people.",
  "- New concepts or variations = same image, new angle: new hook, primary text, headline and CTA. Say which image you reused.",
  '- Only call generate_ad_image when Wali explicitly asks for AI-generated images (e.g. "generate new images"). Otherwise it is refused.',
  "- To launch a variation, use propose_change with the reused image_hash so Hermes uses the exact same picture.",
].join("\n");
