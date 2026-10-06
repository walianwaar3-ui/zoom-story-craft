"use client";

import * as React from "react";
import { Coins, DollarSign, Eye, FileText, Loader2, MousePointerClick, Percent, RefreshCw, Target, UserPlus } from "lucide-react";

import { Markdown } from "@/components/shared/markdown";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { relativeTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";

type Kpis = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number | null;
  leads: number;
  cost_per_lead: number | null;
};
type Snapshot = {
  account: { id: string; name: string; currency: string };
  date_preset: string;
  kpis: Kpis;
  campaigns: { id: string; name: string; objective: string; daily_budget: number | null; lifetime_budget: number | null; kpis: Kpis }[];
  generated_at: string;
};

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "last_7d", label: "7 days" },
  { value: "last_30d", label: "30 days" },
] as const;

async function authedGet<T>(path: string): Promise<T> {
  const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error("Sign in to see Meta Ads data.");
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

const OBJECTIVES: Record<string, string> = {
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Sales",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_APP_PROMOTION: "App",
};

/** Meta Ads KPIs, an on-demand AI report, and active campaigns. Cloud mode only. */
export function MetaAdsPanel() {
  const { mode } = useStore();
  const [preset, setPreset] = React.useState<string>("last_7d");
  const [snap, setSnap] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<{ text: string; at: string; preset: string } | null>(null);
  const [reporting, setReporting] = React.useState(false);
  const [reportError, setReportError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (fresh = false) => {
      setLoading(true);
      setError(null);
      try {
        setSnap(await authedGet<Snapshot>(`/api/hermes/meta/kpis?date_preset=${preset}${fresh ? "&fresh=1" : ""}`));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [preset]
  );

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on load and when the date range changes
    if (mode === "cloud") void load();
  }, [mode, load]);

  const runReport = async () => {
    setReporting(true);
    setReportError(null);
    try {
      const r = await authedGet<{ report: string; generated_at: string; date_preset: string }>(`/api/hermes/meta/report?date_preset=${preset}`);
      setReport({ text: r.report, at: r.generated_at, preset: r.date_preset });
    } catch (e) {
      setReportError((e as Error).message);
    } finally {
      setReporting(false);
    }
  };

  if (mode !== "cloud") return null;

  const cur = snap?.account.currency ?? "USD";
  const money = (v: number | null, digits = 2) =>
    v === null ? "–" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: digits }).format(v);
  const num = (v: number) => new Intl.NumberFormat("en-US").format(Math.round(v));
  const k = snap?.kpis;
  const presetLabel = PRESETS.find((p) => p.value === preset)?.label ?? preset;

  return (
    <section className="space-y-4" aria-labelledby="meta-ads-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="meta-ads-title" className="text-base font-semibold">
            Meta Ads
          </h2>
          <p className="text-sm text-muted-foreground">
            {snap ? `${snap.account.name} · updated ${relativeTime(snap.generated_at)}` : "Live from your Meta ad account"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={preset} onValueChange={setPreset}>
            <TabsList>
              {PRESETS.map((p) => (
                <TabsTrigger key={p.value} value={p.value}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon-sm" onClick={() => void load(true)} disabled={loading} aria-label="Refresh Meta data">
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-2 text-sm">
            <p className="font-medium text-destructive">Couldn&apos;t load Meta Ads data</p>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" aria-busy={loading}>
          <StatCard label="Spend" value={k ? money(k.spend, 0) : "…"} icon={DollarSign} footnote={presetLabel} />
          <StatCard label="Impressions" value={k ? num(k.impressions) : "…"} icon={Eye} footnote={k ? `${num(k.reach)} reached` : undefined} />
          <StatCard label="Clicks" value={k ? num(k.clicks) : "…"} icon={MousePointerClick} />
          <StatCard label="CTR" value={k ? `${k.ctr.toFixed(2)}%` : "…"} icon={Percent} />
          <StatCard label="CPC" value={k ? money(k.cpc) : "…"} icon={Coins} />
          <StatCard label="Leads" value={k ? num(k.leads) : "…"} icon={UserPlus} />
          <StatCard label="Cost per lead" value={k ? money(k.cost_per_lead) : "…"} icon={Target} footnote={k && !k.leads ? "No leads tracked" : undefined} />
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Agent report</CardTitle>
            <CardDescription>
              {report
                ? `${PRESETS.find((p) => p.value === report.preset)?.label ?? report.preset} · written ${relativeTime(report.at)}`
                : "An AI analysis of the numbers above: what's working, what isn't, what to do next."}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => void runReport()} disabled={reporting || !!error}>
            {reporting ? <Loader2 className="animate-spin" /> : <FileText />}
            {reporting ? "Writing…" : report ? "Run again" : "Run agent report"}
          </Button>
        </CardHeader>
        {(report || reportError || reporting) && (
          <CardContent>
            {reportError && (
              <p role="alert" className="text-sm text-destructive">
                {reportError}
              </p>
            )}
            {reporting && !report && <p className="text-sm text-muted-foreground">Analysing your account… this takes up to a minute.</p>}
            {report && <Markdown source={report.text} />}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Meta campaigns</CardTitle>
          <CardDescription>{snap ? `${snap.campaigns.length} active · ${presetLabel}` : "Loading…"}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {snap && snap.campaigns.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No active campaigns in this ad account.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Campaign</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="pr-6 text-right">CPL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(snap?.campaigns ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-72 pl-6">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{OBJECTIVES[c.objective] ?? c.objective}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.daily_budget !== null ? `${money(c.daily_budget, 0)}/day` : c.lifetime_budget !== null ? `${money(c.lifetime_budget, 0)} total` : "Ad set"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(c.kpis.spend, 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.kpis.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{money(c.kpis.cpc)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(c.kpis.leads)}</TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">{money(c.kpis.cost_per_lead)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
