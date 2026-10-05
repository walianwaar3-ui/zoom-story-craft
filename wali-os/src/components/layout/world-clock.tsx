"use client";

import * as React from "react";

import { useStore } from "@/lib/store";

function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- live clock is client-only
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function hourIn(date: Date, tz: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(date));
}

export function WorldClock() {
  const { db } = useStore();
  const now = useNow();
  const clocks = db.settings.clocks;
  if (clocks.length === 0) return null;

  return (
    <div className="hidden items-center gap-1 rounded-lg border bg-card/60 px-1 py-1 xl:flex" aria-label="Client time zones">
      {clocks.map(({ id, city, tz }) => {
        const h = now ? hourIn(now, tz) : -1;
        const working = h >= 9 && h < 18;
        return (
          <div key={id} className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs" title={working ? "Working hours" : "Outside working hours"}>
            <span className={working ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-muted-foreground/40"} />
            <span className="text-muted-foreground">{city}</span>
            <span className="font-medium tabular">
              {now ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now) : "--:--"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
