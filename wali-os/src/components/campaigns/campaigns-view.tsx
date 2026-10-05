"use client";

import * as React from "react";
import { CalendarCheck, DollarSign, Mail, Megaphone, MessageCircle, Plus, Search, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { CampaignStatusBadge } from "@/components/shared/status";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { campaigns, type CampaignStatus, type Channel } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

const channelIcon: Record<Channel, React.ComponentType<{ className?: string }>> = {
  "Meta Ads": Megaphone,
  "WhatsApp Broadcast": MessageCircle,
  Email: Mail,
  LinkedIn: TrendingUp,
  "Google Ads": Search,
};

const running = campaigns.filter((c) => c.status === "live" || c.status === "completed" || c.status === "paused");
const spend = running.reduce((s, c) => s + c.spend, 0);
const leads = running.reduce((s, c) => s + c.leads, 0);
const booked = running.reduce((s, c) => s + c.booked, 0);
const revenue = running.reduce((s, c) => s + c.revenue, 0);

const byChannel = (() => {
  const m = new Map<Channel, { spend: number; booked: number; revenue: number }>();
  running.forEach((c) => {
    const cur = m.get(c.channel) ?? { spend: 0, booked: 0, revenue: 0 };
    m.set(c.channel, { spend: cur.spend + c.spend, booked: cur.booked + c.booked, revenue: cur.revenue + c.revenue });
  });
  return [...m.entries()]
    .map(([channel, v]) => ({ channel, ...v, roas: v.spend ? v.revenue / v.spend : 0 }))
    .sort((a, b) => b.booked - a.booked);
})();
const maxBooked = Math.max(...byChannel.map((c) => c.booked));

export function CampaignsView() {
  const [tab, setTab] = React.useState<"all" | CampaignStatus>("all");
  const [query, setQuery] = React.useState("");

  const rows = campaigns
    .filter((c) => tab === "all" || c.status === tab)
    .filter((c) => !query || `${c.name} ${c.channel} ${c.market}`.toLowerCase().includes(query.toLowerCase()));

  const count = (s: CampaignStatus) => campaigns.filter((c) => c.status === s).length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Campaigns"
        description="Acquisition across Meta, WhatsApp, email, LinkedIn and search — attributed to booked calls and revenue."
        actions={
          <Button size="sm" onClick={() => toast("Campaign builder", { description: "Connect Meta Ads in Settings to launch from Wali OS." })}>
            <Plus /> New campaign
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Ad spend (active period)" value={formatCurrency(spend)} icon={DollarSign} footnote={`${campaigns.filter((c) => c.status === "live").length} live campaigns`} />
        <StatCard label="Leads generated" value={formatNumber(leads)} icon={Target} footnote={`${formatCurrency(spend / leads)} cost per lead`} />
        <StatCard label="Calls booked" value={formatNumber(booked)} icon={CalendarCheck} footnote={`${((booked / leads) * 100).toFixed(1)}% lead → call`} />
        <StatCard label="Attributed revenue" value={formatCurrency(revenue, "USD", true)} icon={TrendingUp} footnote={`${(revenue / spend).toFixed(1)}× return on spend`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Booked calls by channel</CardTitle>
            <CardDescription>Live, paused and completed campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {byChannel.map((c) => {
                const Icon = channelIcon[c.channel];
                return (
                  <li key={c.channel} title={`${c.channel}: ${c.booked} booked · ${c.roas.toFixed(1)}× ROAS`}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Icon className="size-3.5" /> {c.channel}
                      </span>
                      <span className="flex items-baseline gap-2">
                        <span className="text-[11px] text-muted-foreground tabular">{c.roas.toFixed(1)}× ROAS</span>
                        <span className="font-medium tabular">{c.booked}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-1" style={{ width: `${(c.booked / maxBooked) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 xl:col-span-2">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="max-w-full overflow-x-auto scrollbar-thin">
                <TabsTrigger value="all" className="flex-none">All</TabsTrigger>
                <TabsTrigger value="live" className="flex-none">Live <span className="text-[11px] text-muted-foreground">{count("live")}</span></TabsTrigger>
                <TabsTrigger value="scheduled" className="flex-none">Scheduled</TabsTrigger>
                <TabsTrigger value="draft" className="flex-none">Drafts</TabsTrigger>
                <TabsTrigger value="completed" className="flex-none">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter campaigns" className="h-8 pl-8" />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Budget used</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="hidden text-right sm:table-cell">CPL</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="hidden pr-4 text-right lg:table-cell">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No campaigns here yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c) => {
                const Icon = channelIcon[c.channel];
                const used = c.budget ? (c.spend / c.budget) * 100 : 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-72 pl-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.channel} · {c.market} · {formatDate(c.startDate)}–{formatDate(c.endDate)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="hidden w-44 md:table-cell">
                      <div className="flex items-center gap-2">
                        <Progress value={used} className="w-20" indicatorClassName={cn(used > 90 && "bg-warning")} />
                        <span className="text-xs text-muted-foreground tabular">
                          {formatCurrency(c.spend, "USD", true)} / {formatCurrency(c.budget, "USD", true)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular">{c.leads || "—"}</TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular sm:table-cell">
                      {c.leads ? formatCurrency(c.spend / c.leads) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{c.booked || "—"}</TableCell>
                    <TableCell className="hidden pr-4 text-right tabular lg:table-cell">{c.revenue ? formatCurrency(c.revenue, "USD", true) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
