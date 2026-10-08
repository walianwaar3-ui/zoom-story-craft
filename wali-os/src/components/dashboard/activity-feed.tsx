"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, Loader2 } from "lucide-react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACTIVITY_ICON, type ActivityEntry } from "@/lib/activity-feed";
import { dayLabel } from "@/components/inbox/message-bubble";
import { formatDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";

const startOfDay = (offsetDays: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
};

const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Yesterday and today from /api/hermes/activity, fetched with the signed-in
 * session. Refreshes every minute, when the window regains focus and shortly
 * after anything in the store changes (Hermes's writes arrive by realtime).
 */
function useActivityFeed() {
  const { mode, db } = useStore();
  const [entries, setEntries] = React.useState<ActivityEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (mode !== "cloud") return;
    try {
      const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/hermes/activity?from=${encodeURIComponent(startOfDay(-1).toISOString())}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setEntries(body.data ?? []);
      setError(null);
    } catch (e) {
      // Keep showing the last good feed; only say so when there's nothing to show.
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [mode]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; state is set after the request resolves
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [load]);

  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void load(), 1500);
    return () => clearTimeout(t);
  }, [db.tasks, db.approvals, db.threads, db.clients, db.campaigns, load]);

  return { entries, error, mode };
}

function FeedLine({ entry }: { entry: ActivityEntry }) {
  return (
    <li>
      <Link href={entry.link} className="-mx-2 flex items-baseline gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60" title={entry.detail || undefined}>
        <span className="w-5 shrink-0 text-center" aria-hidden>
          {ACTIVITY_ICON[entry.type]}
        </span>
        <span className="line-clamp-2 min-w-0 flex-1 sm:line-clamp-none sm:truncate">
          {entry.title}
          {entry.detail && <span className="text-muted-foreground"> — {entry.detail}</span>}
        </span>
        <time dateTime={entry.at} className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular">
          {clockTime(entry.at)}
        </time>
      </Link>
    </li>
  );
}

/** Everything that moved today and yesterday, newest first, one line each. */
export function ActivityFeed({ className }: { className?: string }) {
  const { entries, error, mode } = useActivityFeed();

  const todayKey = startOfDay(0).toDateString();
  const groups: { label: string; key: string; items: ActivityEntry[] }[] = [];
  for (const e of entries ?? []) {
    const key = new Date(e.at).toDateString();
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = { key, label: dayLabel(e.at), items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }
  const todayCount = groups.find((g) => g.key === todayKey)?.items.length ?? 0;
  const noneToday = entries !== null && todayCount === 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Today&rsquo;s activity</CardTitle>
        <CardDescription>
          {entries === null
            ? formatDate(new Date().toISOString(), { weekday: "long", month: "long", day: "numeric" })
            : todayCount
              ? `${todayCount} thing${todayCount === 1 ? "" : "s"} moved today`
              : "Emails, tasks, meetings, approvals and ads, as they happen"}
        </CardDescription>
        <CardAction>
          <Activity className="size-4 text-muted-foreground" aria-hidden />
        </CardAction>
      </CardHeader>
      <CardContent>
        {mode !== "cloud" ? (
          <p className="py-6 text-center text-sm text-muted-foreground">The activity feed needs cloud sync (Supabase), where Hermes writes.</p>
        ) : entries === null ? (
          error ? (
            <p role="alert" className="py-6 text-center text-sm text-destructive">
              Couldn&rsquo;t load activity: {error}
            </p>
          ) : (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading activity…
            </p>
          )
        ) : (
          <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1 scrollbar-thin">
            {noneToday && (
              <div>
                <p className="sticky top-0 z-10 bg-card pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Today</p>
                <p className="py-3 text-sm text-muted-foreground">Nothing yet today — check back soon.</p>
              </div>
            )}
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <p className="sticky top-0 z-10 bg-card pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {g.label} <span className="font-normal normal-case">· {g.items.length}</span>
                </p>
                <ul>
                  {g.items.map((e) => (
                    <FeedLine key={e.id} entry={e} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
