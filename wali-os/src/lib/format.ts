import { MOCK_NOW } from "@/lib/data/team";

/** Workspace display timezone. Fixed so server and client render identical strings. */
export const WORKSPACE_TZ = "Asia/Dubai";

export function relativeTime(iso: string, now: Date = MOCK_NOW) {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { timeZone: WORKSPACE_TZ, ...opts }).format(new Date(iso));
}

export function formatTime(iso: string, tz: string = WORKSPACE_TZ) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function dueLabel(date: string, now: Date = MOCK_NOW) {
  const today = now.toISOString().slice(0, 10);
  const diffDays = Math.round((new Date(date).getTime() - new Date(today).getTime()) / 86400000);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, tone: "overdue" as const };
  if (diffDays === 0) return { label: "Today", tone: "today" as const };
  if (diffDays === 1) return { label: "Tomorrow", tone: "soon" as const };
  return { label: formatDate(date), tone: "later" as const };
}
