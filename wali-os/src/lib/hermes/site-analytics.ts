/**
 * Server-only report on the tawakkulgrowth.com website, built from `tg_events`
 * (written by the website's own tracker through tg_ingest, in this Supabase
 * project). Used by /api/hermes/site/analytics; never import from client code.
 *
 * Events: pageview, section {id}, scroll {depth}, engaged {seconds, per page view},
 * cta {id}, social {id}, faq {q}, book (the thank-you page, once per booking).
 * Attribution is first touch: the source of each visitor's earliest event.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "./server";

/** Page sections in order, as tagged with data-track on the landing page. */
const SECTIONS: [string, string][] = [
  ["hero", "Hero"],
  ["familiar", "Sound familiar?"],
  ["problem", "The real problem"],
  ["system", "The system"],
  ["gain", "Gain vs reduce"],
  ["fit", "Who it's for"],
  ["about", "About Wali"],
  ["case", "Case study"],
  ["how", "How it works"],
  ["faq", "FAQ"],
  ["book", "Booking calendar"],
];
const DEPTHS = [25, 50, 75, 100];
const MAX_ROWS = 100_000;
/** Below this many visitors a group's rates are noise, so insights skip it. */
const MIN_VISITORS = 20;

type Row = {
  id: number;
  created_at: string;
  visitor_id: string;
  session_id: string;
  event: string;
  page: string | null;
  props: Record<string, unknown> | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  referrer_host: string | null;
  device: string | null;
  country: string | null;
};

export type GroupRow = {
  key: string;
  visitors: number;
  engagedRate: number;
  clickRate: number;
  calendarRate: number;
  booked: number;
  convRate: number;
};

export type SiteReport = {
  range: { days: number; since: string; until: string; tz: string };
  totals: {
    visitors: number;
    sessions: number;
    booked: number;
    convRate: number;
    clicked: number;
    clickRate: number;
    calendar: number;
    medianEngagedSeconds: number | null;
    bounceRate: number;
  };
  insights: string[];
  funnel: { step: string; visitors: number; rate: number }[];
  sectionReach: { id: string; label: string; visitors: number; rate: number }[];
  scroll: { depth: number; visitors: number; rate: number }[];
  ctas: { id: string; clicks: number; sessions: number }[];
  socials: { id: string; clicks: number; visitors: number }[];
  faqs: { q: string; opens: number }[];
  daily: { date: string; visitors: number; bookings: number }[];
  sources: GroupRow[];
  campaigns: GroupRow[];
  devices: GroupRow[];
  countries: GroupRow[];
  referrers: GroupRow[];
  recentBookings: { at: string; source: string; campaign: string; content: string; device: string; country: string; sessions: number }[];
  truncated: boolean;
};

export const RANGES = [1, 7, 30, 90, 365];

export function rangeDays(v: string | null): number {
  const n = Number(v ?? 30);
  if (!RANGES.includes(n)) throw new ApiError(400, `"days" must be one of: ${RANGES.join(", ")}`);
  return n;
}

export function timeZone(v: string | null): string {
  if (!v) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return v;
  } catch {
    throw new ApiError(400, `Unknown time zone "${v}"`);
  }
}

async function loadRows(db: SupabaseClient, since: Date): Promise<{ rows: Row[]; truncated: boolean }> {
  const rows: Row[] = [];
  const page = 1000;
  let after = 0;
  while (rows.length < MAX_ROWS) {
    const { data, error } = await db
      .from("tg_events")
      .select("id, created_at, visitor_id, session_id, event, page, props, source, medium, campaign, content, referrer_host, device, country")
      .gte("created_at", since.toISOString())
      .gt("id", after)
      .order("id")
      .limit(page);
    if (error) {
      if (error.code === "42P01") throw new ApiError(503, "Website analytics table tg_events doesn't exist in this Supabase project");
      throw new ApiError(500, error.message);
    }
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    if (batch.length < page) return { rows, truncated: false };
    after = batch[batch.length - 1].id;
  }
  return { rows, truncated: true };
}

const rate = (n: number, d: number) => (d ? n / d : 0);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

type Visitor = {
  first: Row;
  sessions: Set<string>;
  sections: Set<string>;
  maxDepth: number;
  clicked: boolean;
  engaged: boolean;
  booked: Row | null;
  /** Sessions seen up to and including the booking. */
  sessionsAtBooking: number;
};

export async function siteReport(db: SupabaseClient, days: number, tz: string): Promise<SiteReport> {
  const until = new Date();
  const since = new Date(until.getTime() - days * 86_400_000);
  const { rows, truncated } = await loadRows(db, since);

  const visitors = new Map<string, Visitor>();
  // Engaged seconds per page view (the tracker sends a running total), then per session.
  const pvSeconds = new Map<string, { session: string; seconds: number }>();
  const sessionActive = new Map<string, boolean>();
  const ctas = new Map<string, { clicks: number; sessions: Set<string> }>();
  const socials = new Map<string, { clicks: number; visitors: Set<string> }>();
  const faqs = new Map<string, number>();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const daily = new Map<string, { visitors: Set<string>; bookings: number }>();

  for (const r of rows) {
    if (!r.visitor_id || !r.session_id) continue;
    let v = visitors.get(r.visitor_id);
    if (!v) {
      v = { first: r, sessions: new Set(), sections: new Set(), maxDepth: 0, clicked: false, engaged: false, booked: null, sessionsAtBooking: 0 };
      visitors.set(r.visitor_id, v);
    }
    v.sessions.add(r.session_id);
    if (!sessionActive.has(r.session_id)) sessionActive.set(r.session_id, false);
    const p = r.props ?? {};
    const d = day.format(new Date(r.created_at));
    const dayRow = daily.get(d) ?? { visitors: new Set<string>(), bookings: 0 };
    daily.set(d, dayRow);
    dayRow.visitors.add(r.visitor_id);

    switch (r.event) {
      case "section":
        v.sections.add(str(p.id));
        break;
      case "scroll":
        v.maxDepth = Math.max(v.maxDepth, Number(p.depth) || 0);
        sessionActive.set(r.session_id, true);
        break;
      case "engaged": {
        const key = str(p.pv) || `${r.session_id}:${r.id}`;
        const seconds = Math.min(Number(p.seconds) || 0, 3600);
        const prev = pvSeconds.get(key);
        if (!prev || seconds > prev.seconds) pvSeconds.set(key, { session: r.session_id, seconds });
        break;
      }
      case "cta": {
        v.clicked = true;
        sessionActive.set(r.session_id, true);
        const c = ctas.get(str(p.id)) ?? { clicks: 0, sessions: new Set<string>() };
        c.clicks++;
        c.sessions.add(r.session_id);
        ctas.set(str(p.id), c);
        break;
      }
      case "social": {
        sessionActive.set(r.session_id, true);
        const s = socials.get(str(p.id)) ?? { clicks: 0, visitors: new Set<string>() };
        s.clicks++;
        s.visitors.add(r.visitor_id);
        socials.set(str(p.id), s);
        break;
      }
      case "faq":
        faqs.set(str(p.q), (faqs.get(str(p.q)) ?? 0) + 1);
        break;
      case "book":
        if (!v.booked) {
          v.booked = r;
          v.sessionsAtBooking = v.sessions.size;
          dayRow.bookings++;
        }
        break;
    }
  }

  const sessionSeconds = new Map<string, number>();
  for (const { session, seconds } of pvSeconds.values()) sessionSeconds.set(session, (sessionSeconds.get(session) ?? 0) + seconds);
  // Engaged visitor: 10s+ on the page, or scrolled, or clicked.
  for (const v of visitors.values()) {
    v.engaged = v.clicked || v.maxDepth > 0 || [...v.sessions].some((s) => (sessionSeconds.get(s) ?? 0) >= 10);
  }
  const sessions = sessionActive.size;
  const bounces = [...sessionActive.entries()].filter(([s, active]) => !active && (sessionSeconds.get(s) ?? 0) < 10).length;

  const all = [...visitors.values()];
  const n = all.length;
  const booked = all.filter((v) => v.booked).length;
  const clicked = all.filter((v) => v.clicked).length;
  const calendar = all.filter((v) => v.sections.has("book")).length;

  const group = (keyOf: (v: Visitor) => string, limit = 15): GroupRow[] => {
    const m = new Map<string, Visitor[]>();
    for (const v of all) {
      const k = keyOf(v) || "(unknown)";
      const list = m.get(k);
      if (list) list.push(v);
      else m.set(k, [v]);
    }
    return [...m.entries()]
      .map(([key, vs]) => {
        const b = vs.filter((v) => v.booked).length;
        return {
          key,
          visitors: vs.length,
          engagedRate: rate(vs.filter((v) => v.engaged).length, vs.length),
          clickRate: rate(vs.filter((v) => v.clicked).length, vs.length),
          calendarRate: rate(vs.filter((v) => v.sections.has("book")).length, vs.length),
          booked: b,
          convRate: rate(b, vs.length),
        };
      })
      .sort((a, b) => b.visitors - a.visitors || b.booked - a.booked)
      .slice(0, limit);
  };

  const sources = group((v) => [v.first.source, v.first.medium].filter(Boolean).join(" / "));
  const campaigns = group((v) => (v.first.campaign ? v.first.campaign + (v.first.content ? ` · ${v.first.content}` : "") : "(no campaign)"));

  const sectionReach = SECTIONS.map(([id, label]) => {
    const seen = all.filter((v) => v.sections.has(id)).length;
    return { id, label, visitors: seen, rate: rate(seen, n) };
  });

  const funnel = [
    { step: "Visited", visitors: n },
    { step: "Engaged (10s+, scroll or click)", visitors: all.filter((v) => v.engaged).length },
    { step: "Clicked a booking button", visitors: clicked },
    { step: "Reached the calendar", visitors: calendar },
    { step: "Booked a call", visitors: booked },
  ].map((f) => ({ ...f, rate: rate(f.visitors, n) }));

  // Every day in the range, including empty ones, oldest first.
  const dailyRows: SiteReport["daily"] = [];
  for (let t = since.getTime(); t <= until.getTime() + 1; t += 86_400_000) {
    const d = day.format(new Date(t));
    if (dailyRows.at(-1)?.date === d) continue;
    const row = daily.get(d);
    dailyRows.push({ date: d, visitors: row?.visitors.size ?? 0, bookings: row?.bookings ?? 0 });
  }
  const lastDay = day.format(until);
  if (dailyRows.at(-1)?.date !== lastDay) dailyRows.push({ date: lastDay, visitors: daily.get(lastDay)?.visitors.size ?? 0, bookings: daily.get(lastDay)?.bookings ?? 0 });

  const bookedVisitors = all.filter((v) => v.booked);
  const daysToBook = bookedVisitors.map((v) => (Date.parse(v.booked!.created_at) - Date.parse(v.first.created_at)) / 86_400_000);

  const report: SiteReport = {
    range: { days, since: since.toISOString(), until: until.toISOString(), tz },
    totals: {
      visitors: n,
      sessions,
      booked,
      convRate: rate(booked, n),
      clicked,
      clickRate: rate(clicked, n),
      calendar,
      medianEngagedSeconds: median([...sessionSeconds.values()]),
      bounceRate: rate(bounces, sessions),
    },
    insights: [],
    funnel,
    sectionReach,
    scroll: DEPTHS.map((depth) => {
      const reached = all.filter((v) => v.maxDepth >= depth).length;
      return { depth, visitors: reached, rate: rate(reached, n) };
    }),
    ctas: [...ctas.entries()].map(([id, c]) => ({ id, clicks: c.clicks, sessions: c.sessions.size })).sort((a, b) => b.clicks - a.clicks),
    socials: [...socials.entries()].map(([id, s]) => ({ id, clicks: s.clicks, visitors: s.visitors.size })).sort((a, b) => b.clicks - a.clicks),
    faqs: [...faqs.entries()].map(([q, opens]) => ({ q, opens })).sort((a, b) => b.opens - a.opens),
    daily: dailyRows,
    sources,
    campaigns,
    devices: group((v) => v.first.device ?? ""),
    countries: group((v) => v.first.country ?? ""),
    referrers: group((v) => v.first.referrer_host || "(direct / none)"),
    recentBookings: bookedVisitors
      .sort((a, b) => Date.parse(b.booked!.created_at) - Date.parse(a.booked!.created_at))
      .slice(0, 25)
      .map((v) => ({
        at: v.booked!.created_at,
        source: [v.first.source, v.first.medium].filter(Boolean).join(" / ") || "(unknown)",
        campaign: v.first.campaign ?? "",
        content: v.first.content ?? "",
        device: v.first.device ?? "",
        country: v.first.country ?? "",
        sessions: v.sessionsAtBooking,
      })),
    truncated,
  };
  report.insights = insights(report, median(daysToBook));
  return report;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Plain-language reads, only where there's enough traffic to trust them. */
function insights(r: SiteReport, medianDaysToBook: number | null): string[] {
  const out: string[] = [];
  const t = r.totals;
  if (t.visitors < MIN_VISITORS) return out;

  // Biggest drop between consecutive sections.
  let worst: { from: string; to: string; drop: number } | null = null;
  for (let i = 1; i < r.sectionReach.length; i++) {
    const a = r.sectionReach[i - 1], b = r.sectionReach[i];
    if (!a.visitors) continue;
    const drop = 1 - b.visitors / a.visitors;
    if (!worst || drop > worst.drop) worst = { from: a.label, to: b.label, drop };
  }
  if (worst && worst.drop >= 0.25) out.push(`The biggest drop-off is between "${worst.from}" and "${worst.to}": ${pct(worst.drop)} of readers leave there.`);

  if (t.clicked >= 5 && t.calendar > 0) {
    const clickToBook = t.booked / t.clicked;
    if (clickToBook < 0.2) out.push(`${pct(t.clickRate)} click a booking button but only ${pct(clickToBook)} of them book. Look at the calendar step: available times, load speed, form length.`);
  }

  const best = r.sources.filter((s) => s.visitors >= MIN_VISITORS).sort((a, b) => b.convRate - a.convRate)[0];
  if (best && best.booked > 0) out.push(`${best.key} converts best: ${pct(best.convRate)} of its ${best.visitors} visitors booked.`);

  const mobile = r.devices.find((d) => d.key === "mobile");
  const desktop = r.devices.find((d) => d.key === "desktop");
  if (mobile && desktop && mobile.visitors >= MIN_VISITORS && desktop.visitors >= MIN_VISITORS && desktop.convRate > mobile.convRate * 2)
    out.push(`Desktop converts ${(desktop.convRate / Math.max(mobile.convRate, 0.0001)).toFixed(1)}× better than mobile. Check the page and calendar on a phone.`);

  if (t.bounceRate >= 0.6) out.push(`${pct(t.bounceRate)} of sessions bounce (under 10s, no scroll, no click). The hero isn't holding cold traffic.`);
  if (r.faqs[0] && r.faqs[0].opens >= 5) out.push(`Most-opened question: "${r.faqs[0].q}". Answer it higher up the page.`);
  if (medianDaysToBook !== null && t.booked >= 3)
    out.push(medianDaysToBook < 1 ? "Most people book on the same day they first visit." : `People take a median ${medianDaysToBook.toFixed(1)} days from first visit to booking. Retarget visitors who didn't book.`);
  return out;
}
