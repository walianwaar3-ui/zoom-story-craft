import * as React from "react";

/** Inline **bold**, *italic* and `code`. Builds React nodes, so no HTML is ever injected. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={m.index}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={m.index} className="rounded bg-muted px-1 text-[0.9em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={m.index}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Minimal Markdown for AI-written reports: headings (#–###), bullet and
 * numbered lists, paragraphs, bold/italic/code. Anything else shows as text.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "text-base font-semibold" : level === 2 ? "mt-2 text-sm font-semibold" : "text-sm font-medium";
      blocks.push(
        <p key={i} className={cls} role="heading" aria-level={level + 2}>
          {inline(h[2])}
        </p>
      );
      i++;
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(
        <ul key={i} className="list-disc space-y-1 pl-5">
          {items.map((t, k) => (
            <li key={k}>{inline(t)}</li>
          ))}
        </ul>
      );
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={i} className="list-decimal space-y-1 pl-5">
          {items.map((t, k) => (
            <li key={k}>{inline(t)}</li>
          ))}
        </ol>
      );
    } else if (line.trim() === "" || /^-{3,}$/.test(line.trim())) {
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3}\s|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={i}>{inline(para.join(" "))}</p>);
    }
  }
  return <div className={className ?? "space-y-2 text-sm leading-relaxed"}>{blocks}</div>;
}
