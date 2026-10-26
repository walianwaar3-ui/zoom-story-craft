"use client";

import * as React from "react";
import { CalendarCheck, ChartColumn, Lightbulb, MousePointerClick, Percent, RefreshCw, Timer, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GroupRow, SiteReport } from "@/lib/hermes/site-analytics";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const RANGES = [
  { value: "1", label: "24h" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
];
const RANGE_KEY = "tawakkul-os:site-range";
const SITE = "tawakkulgrowth.com";

const CTA_LABELS: Record<string, string> = {
  hero: "Hero button",
  nav: "Top bar button",
  sticky_mobile: "Sticky mobile button",
  how_it_works: '"How it works" button',
  case_study: "Case study button",
  calendar_new_tab: "Calendar in new tab link",
};

const int = (x: number) => new Intl.NumberFormat("en-US").format(Math.round(x));
const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
const plural = (n: number, word: string) => `${int(n)} ${word}${n === 1 ? "" : "s"}`;
const duration = (s: number | null) => (s === null ? "–" : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`);
const shortDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Website analytics for tawakkulgrowth.com, read through /api/hermes/site/analytics. */
export function SiteAnalyticsView() {
  const { mode } = useStore();
  const [range, setRange] = React.useState("30");
  const [report, setReport] = React.useState<SiteReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(RANGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the remembered range once on mount
      if (saved && RANGES.some((r) => r.value === saved)) setRange(saved);
    } catch {}
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error("Sign in to see website analytics.");
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(`/api/hermes/site/analytics?days=${range}&tz=${encodeURIComponent(tz)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setReport(data as SiteReport);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on load and when the range changes
    if (mode === "cloud") void load();
  }, [mode, load]);

  const changeRange = (v: string) => {
    setRange(v);
    try {
      localStorage.setItem(RANGE_KEY, v);
    } catch {}
  };

  const header = (
    <PageHeader
      title="Website analytics"
      description={`Visitors, funnel and bookings on ${SITE}. No cookies or personal data; your own visits are excluded.`}
      actions={
        mode === "cloud" && (
          <>
            <Tabs value={range} onValueChange={changeRange} className="max-w-full overflow-x-auto">
              <TabsList>
                {RANGES.map((r) => (
                  <TabsTrigger key={r.value} value={r.value}>
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="outline" size="icon-sm" onClick={() => void load()} disabled={loading} aria-label="Refresh analytics">
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
          </>
        )
      }
    />
  );

  if (mode !== "cloud") {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState icon={ChartColumn} title="Needs cloud sync" description="Website analytics are stored in Supabase. Connect Supabase to see them here." />
        </Card>
      </div>
    );
  }

  const t = report?.totals;
  const r = report;

  return (
    <div className="space-y-6">
      {header}

      {error && (
        <Card>
          <CardContent className="py-2 text-sm">
            <p className="font-medium text-destructive">Couldn&apos;t load website analytics</p>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-busy={loading}>
        <StatCard
          accent
          label="Booked calls"
          value={t ? int(t.booked) : "…"}
          icon={CalendarCheck}
          footnote={t ? `${pct(t.convRate, 1)} of visitors` : undefined}
        />
        <StatCard label="Visitors" value={t ? int(t.visitors) : "…"} icon={Users} footnote={t ? `${int(t.sessions)} sessions` : undefined} />
        <StatCard label="Visitor → booking" value={t ? pct(t.convRate, 1) : "…"} icon={Percent} />
        <StatCard
          label="Clicked a booking button"
          value={t ? pct(t.clickRate, 1) : "…"}
          icon={MousePointerClick}
          footnote={t ? `${int(t.clicked)} visitors` : undefined}
        />
        <StatCard label="Median engaged time" value={t ? duration(t.medianEngagedSeconds) : "…"} icon={Timer} footnote="per session" />
        <StatCard label="Bounce rate" value={t ? pct(t.bounceRate) : "…"} icon={Percent} footnote="<10s, no scroll, no click" />
      </div>

      {r?.truncated && <p className="text-sm text-muted-foreground">Showing the first 100,000 events in this range. Pick a shorter range for exact numbers.</p>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-brand-tag" />
            What the data says
          </CardTitle>
          <CardDescription>Plain-language reads. They appear once there&apos;s enough traffic to trust them (20+ visitors).</CardDescription>
        </CardHeader>
        <CardContent>
          {r && r.insights.length ? (
            <ul className="space-y-2 text-sm">
              {r.insights.map((s) => (
                <li key={s} className="flex gap-2">
                  <span aria-hidden className="font-bold text-brand-tag">
                    →
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{r ? "No clear signal yet. Keep sending traffic." : "Loading…"}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Conversion funnel" description="Unique visitors at each step, as a share of everyone who visited.">
          <Bars
            empty="No visitors yet."
            rows={(r?.funnel ?? []).map((f, i, all) => {
              const prev = i ? all[i - 1].visitors : 0;
              return {
                label: f.step,
                ratio: f.rate,
                value: int(f.visitors),
                note: pct(f.rate),
                drop: i && prev && f.visitors < prev ? 1 - f.visitors / prev : undefined,
              };
            })}
          />
        </Panel>
        <Panel title="Page drop-off" description="Share of visitors who saw each section, in page order. A sharp step down marks where people leave.">
          <Bars
            empty="No visitors yet."
            rows={t?.visitors ? (r?.sectionReach ?? []).map((s) => ({ label: s.label, ratio: s.rate, value: pct(s.rate), note: int(s.visitors) })) : []}
          />
        </Panel>
        <Panel title="Visitors per day" description="Unique visitors.">
          <Columns data={r?.daily ?? []} field="visitors" unit="visitors" />
        </Panel>
        <Panel title="Booked calls per day" description="Visits to the thank-you page.">
          <Columns data={r?.daily ?? []} field="bookings" unit="booked calls" />
        </Panel>
      </div>

      <GroupTable title="Where visitors came from" description="First touch: the source of each visitor's first visit, even if they booked on a later one." head="Source / medium" rows={r?.sources} />
      <GroupTable title="Campaigns & ads" description="utm_campaign · utm_content (first touch). Tag every ad with utm_content to compare creatives." head="Campaign · ad" rows={r?.campaigns} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Booking buttons clicked" description="Which button people use.">
          <Bars
            empty="No clicks yet."
            rows={(r?.ctas ?? []).map((c, _, all) => ({
              label: CTA_LABELS[c.id] ?? c.id,
              ratio: c.clicks / Math.max(1, ...all.map((x) => x.clicks)),
              value: int(c.clicks),
              note: plural(c.sessions, "session"),
            }))}
          />
        </Panel>
        <Panel title="Scroll depth" description="Share of visitors who scrolled at least this far.">
          <Bars
            empty="No visitors yet."
            rows={t?.visitors ? (r?.scroll ?? []).map((s) => ({ label: `${s.depth}% of page`, ratio: s.rate, value: pct(s.rate), note: int(s.visitors) })) : []}
          />
        </Panel>
        <Panel title="FAQ opens" description="The questions people have before booking.">
          <Bars
            empty="No FAQ opens yet."
            rows={(r?.faqs ?? []).map((f, _, all) => ({ label: f.q, ratio: f.opens / Math.max(1, ...all.map((x) => x.opens)), value: int(f.opens) }))}
          />
        </Panel>
      </div>

      <Panel title="Social follows" description='Clicks to Instagram / Facebook. These visitors chose "follow" instead of "book": a warm audience to retarget.'>
        <Bars
          empty="No social clicks yet."
          rows={(r?.socials ?? []).map((s, _, all) => ({
            label: s.id === "instagram" ? "Instagram" : s.id === "facebook" ? "Facebook" : s.id,
            ratio: s.clicks / Math.max(1, ...all.map((x) => x.clicks)),
            value: int(s.clicks),
            note: plural(s.visitors, "visitor"),
          }))}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <GroupTable compact title="Devices" head="Device" rows={r?.devices} />
        <GroupTable compact title="Countries" head="Country" rows={r?.countries} />
        <GroupTable compact title="Referring sites" head="Site" rows={r?.referrers} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent bookings</CardTitle>
          <CardDescription>No personal details are stored. Match these to GoHighLevel by time.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {r && r.recentBookings.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No bookings in this range yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">When</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Campaign · ad</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="pr-6 text-right">Visits before booking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(r?.recentBookings ?? []).map((b) => (
                  <TableRow key={b.at + b.source}>
                    <TableCell className="pl-6 whitespace-nowrap">
                      {new Date(b.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </TableCell>
                    <TableCell>{b.source}</TableCell>
                    <TableCell>{b.campaign ? b.campaign + (b.content ? ` · ${b.content}` : "") : "–"}</TableCell>
                    <TableCell>{b.device || "–"}</TableCell>
                    <TableCell>{b.country || "–"}</TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">{int(b.sessions)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type BarRow = { label: string; ratio: number; value: string; note?: string; drop?: number };

/** Ranked horizontal bars: label, bar, value. */
function Bars({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li
          key={row.label}
          className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,38%)_1fr_auto]"
          title={`${row.label}: ${row.value}${row.note ? ` (${row.note})` : ""}`}
        >
          <span className="col-span-2 truncate text-muted-foreground sm:col-span-1">{row.label}</span>
          <span className="h-3.5">
            <span
              className="block h-full min-w-0.5 rounded-r bg-chart-1"
              style={{ width: `${Math.max(0, Math.min(1, row.ratio)) * 100}%` }}
            />
          </span>
          <span className="min-w-20 text-right tabular-nums">
            {row.value}
            {row.note && <small className="ml-1.5 text-muted-foreground">{row.note}</small>}
            {row.drop !== undefined && <span className="block text-xs text-destructive">−{pct(row.drop)} from previous step</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((s) => s * p >= v) ?? 10) * p;
}

/** One series per day as columns, with a hover/focus tooltip. */
function Columns({ data, field, unit }: { data: SiteReport["daily"]; field: "visitors" | "bookings"; unit: string }) {
  const [active, setActive] = React.useState<number | null>(null);
  if (!data.length) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const max = niceMax(Math.max(0, ...data.map((d) => d[field])));
  const step = Math.max(1, Math.ceil(data.length / 6));
  const hovered = active === null ? null : data[active];

  return (
    <div className="relative">
      <div className="flex h-44 gap-2">
        <div className="flex flex-col justify-between pb-5 text-right text-[11px] text-muted-foreground tabular-nums" aria-hidden>
          <span>{int(max)}</span>
          <span>{int(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 border-t border-border/60" aria-hidden />
          <div className="absolute inset-x-0 top-[calc(50%-10px)] border-t border-border/60" aria-hidden />
          <div
            className="absolute inset-x-0 top-0 bottom-5 flex items-end gap-[2px] border-b border-border"
            role="img"
            aria-label={`${unit} per day, ${data.length} days, total ${int(data.reduce((s, d) => s + d[field], 0))}`}
            onPointerLeave={() => setActive(null)}
          >
            {data.map((d, i) => (
              <div
                key={d.date}
                className="flex h-full min-w-0 flex-1 items-end outline-none"
                tabIndex={0}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <div
                  className={cn("mx-auto w-full max-w-[18px] rounded-t bg-chart-1 transition-[filter]", active === i && "brightness-110")}
                  style={{ height: `${(d[field] / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex h-4 text-[11px] text-muted-foreground" aria-hidden>
            {data.map((d, i) => (
              <span key={d.date} className="relative flex-1">
                {(i === data.length - 1 || (i % step === 0 && data.length - 1 - i >= step)) && (
                  <span className={cn("absolute whitespace-nowrap", i === 0 ? "left-0" : i === data.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2")}>
                    {shortDate(d.date)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 h-5 text-sm" role="status">
        {hovered ? (
          <>
            <strong className="tabular-nums">{int(hovered[field])}</strong> {unit} <span className="text-muted-foreground">· {shortDate(hovered.date)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Hover or tab to a day for its number.</span>
        )}
      </p>
    </div>
  );
}

function GroupTable({ title, description, head, rows, compact = false }: { title: string; description?: string; head: string; rows?: GroupRow[]; compact?: boolean }) {
  const max = Math.max(1, ...(rows ?? []).map((x) => x.visitors));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-0">
        {rows && rows.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{head}</TableHead>
                <TableHead className="text-right">Visitors</TableHead>
                {!compact && (
                  <>
                    <TableHead className="text-right">Engaged</TableHead>
                    <TableHead className="text-right">Clicked button</TableHead>
                    <TableHead className="text-right">Reached calendar</TableHead>
                  </>
                )}
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="pr-6 text-right">{compact ? "Conv." : "Conv. rate"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((x) => (
                <TableRow key={x.key}>
                  <TableCell className="max-w-64 truncate pl-6" title={x.key}>
                    {x.key}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {!compact && (
                      <span aria-hidden className="mr-2 inline-block h-2 rounded-r-sm bg-chart-1 align-middle" style={{ width: `${Math.round((x.visitors / max) * 48)}px` }} />
                    )}
                    {int(x.visitors)}
                  </TableCell>
                  {!compact && (
                    <>
                      <TableCell className="text-right tabular-nums">{pct(x.engagedRate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(x.clickRate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(x.calendarRate)}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums">{int(x.booked)}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">{pct(x.convRate, 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
