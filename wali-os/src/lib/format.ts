/** Local calendar date as YYYY-MM-DD. */
export function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  // Plain dates (YYYY-MM-DD) are calendar days, so render them without timezone shifting.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat("en-US", opts).format(date);
}

export function formatTime(iso: string, tz?: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function dueLabel(date: string) {
  if (!date) return { label: "No date", tone: "later" as const };
  const diffDays = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${todayIso()}T12:00:00`).getTime()) / 86400000);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, tone: "overdue" as const };
  if (diffDays === 0) return { label: "Today", tone: "today" as const };
  if (diffDays === 1) return { label: "Tomorrow", tone: "soon" as const };
  return { label: formatDate(date), tone: "later" as const };
}

export function mailtoHref(to: string, subject: string, body: string) {
  const s = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  return `mailto:${to.trim()}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(body)}`;
}
