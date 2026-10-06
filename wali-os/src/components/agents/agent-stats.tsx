"use client";

import * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { relativeTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export interface AgentStats {
  tasks: { todo: number; in_progress: number; review?: number; done: number };
  approvals_pending: number;
  approvals_last_24h: number;
  last_active: string | null;
}

/**
 * Per-agent stats from /api/hermes/agent-stats, fetched with the signed-in
 * session. Loads once, refreshes when the window regains focus, and (debounced)
 * when tasks or approvals change, so the bars follow Hermes's work live.
 */
export function useAgentStats() {
  const { mode, db } = useStore();
  const [stats, setStats] = React.useState<Record<string, AgentStats>>({});

  const load = React.useCallback(async () => {
    if (mode !== "cloud") return;
    try {
      const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/hermes/agent-stats", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats ?? {});
    } catch {
      // Bars are a nice-to-have: keep the last known values on a network error.
    }
  }, [mode]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; state is set after the request resolves
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Live: when tasks or approvals change (yours or Hermes's), refetch shortly after.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void load(), 1000);
    return () => clearTimeout(t);
  }, [db.tasks, db.approvals, load]);

  return stats;
}

type Segment = { label: string; value: number; className: string };

// Brand tokens: to do = gold, in progress = action blue, done = success green.
const AMBER = "bg-brand-highlight";
const BLUE = "bg-brand-action";
const GREEN = "bg-success";

function StatBar({ label, segments, detail }: { label: string; segments: Segment[]; detail?: React.ReactNode }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  const summary = segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="grid cursor-default grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs" aria-label={`${label}: ${summary}`} tabIndex={0}>
          <span className="text-muted-foreground">{label}</span>
          {/* Segments sized by count, 2px gaps between them. */}
          <div className="flex h-1.5 gap-0.5" aria-hidden>
            {segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <span key={s.label} className={cn("h-full rounded-full", s.className)} style={{ flexGrow: s.value, flexBasis: 0 }} />
              ))}
          </div>
          <span className="flex items-center gap-1.5 text-foreground tabular-nums" aria-hidden>
            {segments.map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <span className="text-muted-foreground">·</span>}
                <span>{s.value}</span>
              </React.Fragment>
            ))}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="min-w-40">
        <p className="mb-1 font-medium">{label}</p>
        <ul className="space-y-0.5">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", s.className)} aria-hidden />
              <span className="flex-1">{s.label}</span>
              <span className="tabular-nums">{s.value}</span>
            </li>
          ))}
        </ul>
        {detail && <p className="mt-1 opacity-80">{detail}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Tasks and approvals bars plus "Active … ago" for one agent card. Renders nothing when there's no activity. */
export function AgentStatsBars({ stats }: { stats?: AgentStats }) {
  if (!stats) return null;
  const { tasks } = stats;
  const any =
    tasks.todo + tasks.in_progress + tasks.done + stats.approvals_pending + stats.approvals_last_24h > 0 || Boolean(stats.last_active);
  if (!any) return null;
  return (
    <div className="space-y-1.5">
      <StatBar
        label="Tasks"
        segments={[
          { label: "To do", value: tasks.todo, className: AMBER },
          { label: "In progress", value: tasks.in_progress, className: BLUE },
          { label: "Done", value: tasks.done, className: GREEN },
        ]}
        detail={tasks.review ? `In progress includes ${tasks.review} in review` : undefined}
      />
      <StatBar
        label="Approvals"
        segments={[
          { label: "Pending", value: stats.approvals_pending, className: AMBER },
          { label: "Last 24h", value: stats.approvals_last_24h, className: BLUE },
        ]}
      />
      {stats.last_active && (
        <p className="text-xs text-muted-foreground" title={new Date(stats.last_active).toLocaleString()}>
          Active {relativeTime(stats.last_active)}
        </p>
      )}
    </div>
  );
}
