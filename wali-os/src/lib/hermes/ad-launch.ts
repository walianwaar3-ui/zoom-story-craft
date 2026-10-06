/**
 * "Execute, don't propose" for the Ads Planner: when Wali asks for an ad, the
 * agent finishes ONE ad (reused winning image + final copy) and files it as a
 * launch-ready approval. Wali taps Approve; Hermes creates it in Meta.
 */

/** Wali is asking for a new ad (not a question about existing ones). */
const ASKS_FOR_AD = [
  /\b(make|create|write|build|launch|draft|design|need|want|give me|spin up)\b[^.?!\n]{0,40}\b(ad|ads|creative|creatives|angle|angles|variation|variations|version|concept|concepts)\b/i,
  /\b(new|another|fresh)\s+(ad|creative|angle|variation|version|concept)s?\b/i,
];

export function asksForNewAd(message: string) {
  return ASKS_FOR_AD.some((re) => re.test(message));
}

export const CTA_TYPES = ["LEARN_MORE", "SIGN_UP", "BOOK_NOW", "APPLY_NOW", "CONTACT_US", "GET_QUOTE", "SUBSCRIBE", "DOWNLOAD", "GET_OFFER", "SEND_MESSAGE"] as const;

export const EXECUTE_RULES = [
  "Execute, don't propose (strict):",
  "- When Wali asks for an ad, deliver ONE finished ad in this reply. No questions, no options, no plans, no 'would you like'.",
  "- Steps: get_breakdown (level ad, last_14d) to find the winner (most leads at the lowest cost per lead), reuse_ad_image on it, then create_ad with final copy.",
  "- If Wali named a campaign or ad, use that one instead of the overall winner.",
  "- One ad per request. A second create_ad is refused; Wali asks again for the next one.",
  "- After create_ad, reply with the ad as it will run (hook, primary text, headline, CTA), one line on why it should beat the winner, and that it is waiting for Approve.",
].join("\n");

/** Exact fix-up message when the model answered without creating the ad. */
export const EXECUTE_NUDGE =
  "You replied without creating the ad. Wali asked for an ad: execute now. Find the winner, reuse_ad_image, then create_ad with final copy. No questions, no options.";

export interface AdSpec {
  source: { ad_id: string; name: string; adset_id: string; campaign_id: string | null; creative_id: string | null; page_id: string | null; instagram_user_id: string | null };
  image: { image_hash: string | null; image_url: string };
  copy: { hook: string; primary_text: string; headline: string; description: string | null; call_to_action: string; link: string };
  name: string;
  status: "PAUSED" | "ACTIVE";
}

/** Approval body: readable for Wali, with an exact JSON spec for Hermes to execute. */
export function adApprovalContent(spec: AdSpec) {
  const c = spec.copy;
  return [
    `**Launch new ad** in ad set ${spec.source.adset_id}, reusing the image of "${spec.source.name}" (ad ${spec.source.ad_id}).`,
    `Starts as **${spec.status}**.`,
    "",
    `**Primary text**\n${c.primary_text}`,
    "",
    `**Headline:** ${c.headline}`,
    c.description ? `**Description:** ${c.description}` : null,
    `**CTA:** ${c.call_to_action} → ${c.link}`,
    "",
    "Hermes: if image_hash is null, upload image_url to /adimages first. Create an ad creative (object_story_spec.link_data with the image_hash, page_id, message, name, description, call_to_action, link), then an ad in adset_id with that creative and status. Then call /executed.",
    "```json",
    JSON.stringify(spec, null, 2),
    "```",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
