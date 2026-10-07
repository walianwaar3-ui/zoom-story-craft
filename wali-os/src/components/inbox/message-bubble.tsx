"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cleanEmailBody } from "@/lib/email-clean";
import type { EmailMessage } from "@/lib/data/types";
import { formatDate, formatTime, relativeTime } from "@/lib/format";
import { cn, initials } from "@/lib/utils";

/**
 * One email in a thread: its own card with sender and date, showing only what
 * was written in that message. Quoted history and signature sit behind "···".
 */
export function MessageBubble({ message, contactName, contactEmail, ownerName }: { message: EmailMessage; contactName: string; contactEmail: string; ownerName: string }) {
  const [showQuoted, setShowQuoted] = React.useState(false);
  const { text, hidden } = React.useMemo(() => cleanEmailBody(message.body), [message.body]);
  const out = message.direction === "out";
  const name = out ? ownerName || "You" : contactName || contactEmail;

  return (
    <article className={cn("flex gap-3", out ? "flex-row-reverse pl-6 sm:pl-16" : "pr-6 sm:pr-16")}>
      <Avatar className="mt-1 size-8 shrink-0">
        <AvatarFallback className={cn("text-xs", out ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary")}>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className={cn("min-w-0 flex-1 rounded-xl border p-4 shadow-xs", out ? "border-primary/25 bg-primary/5" : "bg-card")}>
        <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold">{out ? "You" : name}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">{out ? `to ${contactName || contactEmail}` : contactEmail}</span>
          </p>
          <time dateTime={message.at} title={new Date(message.at).toLocaleString()} className="shrink-0 text-xs text-muted-foreground">
            {formatDate(message.at, { weekday: "short", month: "short", day: "numeric" })} · {formatTime(message.at)} ({relativeTime(message.at)})
          </time>
        </header>
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{text}</p>
        {hidden && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowQuoted((v) => !v)}
              className="inline-flex items-center rounded-md border bg-muted/60 px-1.5 text-muted-foreground hover:bg-muted"
              aria-expanded={showQuoted}
              aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"}
              title={showQuoted ? "Hide quoted text" : "Show quoted text"}
            >
              <MoreHorizontal className="size-4" />
            </button>
            {showQuoted && <p className="mt-2 border-l-2 pl-3 text-xs leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">{hidden}</p>}
          </div>
        )}
      </div>
    </article>
  );
}

/** "Today", "Yesterday" or the date, for separators between days in a thread. */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return formatDate(iso, { weekday: "long", month: "long", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
