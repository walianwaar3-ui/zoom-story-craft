/**
 * Turn a stored email body into what the person actually wrote: no quoted
 * history ("On … wrote:", "> " lines, Outlook headers) and no signature block.
 * Stored bodies stay untouched; this runs when displaying or giving emails to AI.
 * Pure, safe for client and server code.
 */

export interface CleanBody {
  /** The new text of this message. */
  text: string;
  /** What was hidden (quoted history and signature), for a "show quoted text" toggle. */
  hidden: string;
}

// Gmail/Apple: "On Wed, Oct 7, 2026 at 3:09 AM Wali Anwar <walianwaar3@gmail.com> wrote:" (often wrapped over two lines).
const ON_WROTE = /^[ \t]*(On|Le|Am|El)\b[^\n]{0,240}(\n[^\n]{0,160})?\b(wrote|a écrit|schrieb|escribió)\s*:\s*$/im;
// Outlook / forwarded headers.
const OUTLOOK = /^[ \t]*(-{2,}\s*Original Message\s*-{2,}|_{10,}|From:\s.+\n\s*(Sent|Date):\s.+)/im;
const FORWARDED = /^[ \t]*-{5,}\s*Forwarded message\s*-{5,}/im;
// "-- " signature delimiter (RFC 3676).
const SIG_DELIM = /^-- ?$/m;

/** Index where a signature made of image/link lines starts ("[image: facebook] <https://…>" etc.). */
function imageSignatureStart(text: string) {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\[image: [^\]]*\]/.test(lines[i])) {
      const rest = lines.slice(i).join("\n");
      // A signature, not an inline picture: several image tags and no real paragraph after it.
      const images = (rest.match(/\[image: [^\]]*\]/g) ?? []).length;
      const longProse = lines.slice(i).some((l) => l.length > 160 && !/https?:\/\//.test(l));
      if (images >= 2 && !longProse) return offset;
    }
    offset += lines[i].length + 1;
  }
  return -1;
}

export function cleanEmailBody(raw: string): CleanBody {
  const text = (raw ?? "").replace(/\r\n?/g, "\n");
  let cut = text.length;
  for (const re of [ON_WROTE, OUTLOOK, FORWARDED, SIG_DELIM]) {
    const m = re.exec(text);
    if (m && m.index > 0 && m.index < cut) cut = m.index;
  }
  const sig = imageSignatureStart(text.slice(0, cut));
  if (sig > 0) cut = sig;

  let main = text.slice(0, cut);
  // A trailing block of "> " quoted lines with no marker above it.
  main = main.replace(/(\n[ \t]*>[^\n]*)+\s*$/, "");
  main = main.replace(/\n{3,}/g, "\n\n").trim();

  // Never hide everything: a message that is only a quote (e.g. a forward) shows as is.
  if (!main) return { text: text.trim(), hidden: "" };
  return { text: main, hidden: text.slice(cut).trim() };
}

/** One-line preview of a message for lists. */
export function emailPreview(raw: string, max = 140) {
  const t = cleanEmailBody(raw).text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
