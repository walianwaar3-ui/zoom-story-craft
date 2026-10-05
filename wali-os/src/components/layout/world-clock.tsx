"use client";

import * as React from "react";

import { worldClocks } from "@/lib/data";

function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- live clock is client-only to avoid hydration mismatch
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function isWorkingHours(date: Date, tz: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(date));
  return hour >= 9 && hour < 18;
}

export function WorldClock() {
  const now = useNow();

  return (
    <div className="hidden items-center gap-1 rounded-lg border bg-card/60 px-1 py-1 xl:flex" aria-label="Client timezones">
      {worldClocks.map(({ city, tz }) => {
        const working = now ? isWorkingHours(now, tz) : false;
        return (
          <div key={city} className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs" title={working ? "Working hours" : "Outside working hours"}>
            <span className={working ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-muted-foreground/40"} />
            <span className="text-muted-foreground">{city}</span>
            <span className="font-medium tabular">
              {now
                ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now)
                : "--:--"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
