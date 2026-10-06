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
  "- A new ad = same image, new angle: new hook, primary text, headline and CTA. Say which image you reused.",
  '- Only call generate_ad_image when Wali explicitly asks for AI-generated images (e.g. "generate new images"). Otherwise it is refused.',
  "- AI images are built on the winning ad's photo as a visual reference (same person and style, new scene). Pass the winner as reference_ad_id; if you don't, the server uses the ad with the lowest cost per lead.",
  "- To launch it, use create_ad with the winner as source_ad_id: Hermes reuses the exact same picture.",
].join("\n");

/** Default image model: GPT Image 2 on Fal (same FAL_KEY). FAL_IMAGE_MODEL overrides it. */
export const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2";

/**
 * Exact pixel sizes per ad format for GPT Image 2: multiples of 16 and within
 * its 655,360 to 8,294,400 pixel range (Fal's 9:16 preset falls below it).
 * Portrait is Meta's 4:5 feed shape.
 */
const GPT_IMAGE_SIZES: Record<string, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1280 },
  story: { width: 1088, height: 1920 },
  landscape: { width: 1920, height: 1088 },
};
const FLUX_SIZES: Record<string, string> = { square: "square_hd", portrait: "portrait_4_3", story: "portrait_16_9", landscape: "landscape_16_9" };

/**
 * Fal endpoint and request body for the model in use. With reference images
 * (GPT Image models only) it calls the model's /edit endpoint, which takes
 * image_urls as visual references; other models ignore references.
 */
export function falImageRequest(model: string, prompt: string, format: string, count: number, quality = "high", referenceUrls: string[] = []) {
  const num_images = Math.min(Math.max(Math.floor(count) || 1, 1), 4);
  if (model.startsWith("openai/gpt-image")) {
    const refs = referenceUrls.filter((u) => /^https:\/\//.test(u)).slice(0, 4);
    const body = {
      prompt,
      image_size: GPT_IMAGE_SIZES[format] ?? GPT_IMAGE_SIZES.square,
      quality: ["low", "medium", "high", "auto"].includes(quality) ? quality : "high",
      num_images,
      output_format: "jpeg",
    };
    return refs.length ? { endpoint: `${model}/edit`, body: { ...body, image_urls: refs } } : { endpoint: model, body };
  }
  return { endpoint: model, body: { prompt, image_size: FLUX_SIZES[format] ?? "square_hd", num_images } };
}

/**
 * Prompt for a new image built on the winning ad's photo: same person, look and
 * photographic style, new scene. Keeps what already converts, varies the angle.
 */
export function referencePrompt(scenePrompt: string) {
  return [
    "Use the reference image (our best-performing ad) as the visual guide.",
    "Keep the same person: same face, hair, skin tone, age and style of clothing. Keep its lighting, colour palette and photographic style.",
    `New scene: ${scenePrompt}`,
  ].join(" ");
}

/** The winning ad: most leads at the lowest cost per lead, among ads with leads. */
export function pickWinner<T extends { ad_id?: string; leads: number; cost_per_lead: number | null; spend: number }>(rows: T[]): T | null {
  const withLeads = rows.filter((r) => r.ad_id && r.leads > 0 && r.cost_per_lead !== null);
  withLeads.sort((a, b) => (a.cost_per_lead as number) - (b.cost_per_lead as number) || b.leads - a.leads);
  return withLeads[0] ?? null;
}
