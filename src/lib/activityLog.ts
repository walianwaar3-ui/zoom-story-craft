import { supabase } from "@/integrations/supabase/client";

export type ActivityFeature =
  | "zoom_post"
  | "manual_post"
  | "raw_post"
  | "smart_regenerate_image"
  | "regenerate_caption"
  | "generate_image_for_post"
  | "ghl_schedule"
  | "fathom_import"
  | "other";

export const FEATURE_LABELS: Record<ActivityFeature, string> = {
  zoom_post: "Zoom Transcript → Post",
  manual_post: "Manual Post",
  raw_post: "Raw Post",
  smart_regenerate_image: "Smart Image Regenerate",
  regenerate_caption: "Caption Regenerate",
  generate_image_for_post: "Generate Image",
  ghl_schedule: "GHL Schedule",
  fathom_import: "Fathom Import",
  other: "Other",
};

export async function logActivity(params: {
  feature: ActivityFeature;
  label?: string;
  inputs: Record<string, unknown>;
  content_id?: string | null;
  transcript_id?: string | null;
}) {
  try {
    // Strip undefined values & overly large fields to keep the log readable
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params.inputs || {})) {
      if (v === undefined || v === null || v === "") continue;
      if (typeof v === "string" && v.length > 4000) {
        cleaned[k] = v.slice(0, 4000) + "…[truncated]";
      } else {
        cleaned[k] = v;
      }
    }
    await (supabase as any).from("activity_log").insert({
      feature: params.feature,
      label: params.label || null,
      inputs: cleaned,
      content_id: params.content_id || null,
      transcript_id: params.transcript_id || null,
    });
  } catch (e) {
    console.warn("activity log failed", e);
  }
}
