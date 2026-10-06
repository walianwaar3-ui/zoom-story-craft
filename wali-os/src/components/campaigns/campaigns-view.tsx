"use client";

import * as React from "react";
import { CalendarCheck, DollarSign, Megaphone, MoreHorizontal, Plus, Search, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { CampaignStatusBadge, campaignStatusMeta } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Campaign, CampaignStatus } from "@/lib/data/types";
import { formatDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

import { CampaignFormDialog } from "./campaign-form";
import { MetaAdsPanel } from "./meta-ads-panel";

export function CampaignsView() {
  const { db, remove } = useStore();
  const cur = db.settings.currency;
  const campaigns = db.campaigns;
  const [tab, setTab] = React.useState<"all" | CampaignStatus>("all");
  const [query, setQuery] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Campaign | undefined>();
  const [deleting, setDeleting] = React.useState<Campaign | undefined>();

  const totals = campaigns.reduce(
    (t, c) => ({ spend: t.spend + c.spend, leads: t.leads + c.leads, booked: t.booked + c.booked, revenue: t.revenue + c.revenue }),
    { spend: 0, leads: 0, booked: 0, revenue: 0 }
  );

  const byChannel = React.useMemo(() => {
    const m = new Map<string, { spend: number; booked: number; revenue: number; leads: number }>();
    campaigns.forEach((c) => {
      const cur = m.get(c.channel) ?? { spend: 0, booked: 0, revenue: 0, leads: 0 };
      m.set(c.channel, { spend: cur.spend + c.spend, booked: cur.booked + c.booked, revenue: cur.revenue + c.revenue, leads: cur.leads + c.leads });
    });
    return [...m.entries()].map(([channel, v]) => ({ channel, ...v })).sort((a, b) => b.leads - a.leads);
  }, [campaigns]);
  const maxLeads = Math.max(1, ...byChannel.map((c) => c.leads));

  const rows = campaigns
    .filter((c) => tab === "all" || c.status === tab)
    .filter((c) => !query || `${c.name} ${c.channel} ${c.market}`.toLowerCase().includes(query.toLowerCase()));

  const openForm = (c?: Campaign) => {
    setEditing(c);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Campaigns"
        description="Track every acquisition effort from spend to leads, booked calls and revenue."
        actions={
          <Button size="sm" onClick={() => openForm()}>
            <Plus /> Add campaign
          </Button>
        }
      />

      <MetaAdsPanel />

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Add an outreach sequence, ad campaign, event or referral push, then update its numbers as results come in."
            action={
              <Button onClick={() => openForm()}>
                <Plus /> Add your first campaign
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Total spend" value={formatCurrency(totals.spend, cur)} icon={DollarSign} footnote={`${campaigns.filter((c) => c.status === "live").length} live campaigns`} />
            <StatCard label="Leads" value={formatNumber(totals.leads)} icon={Target} footnote={totals.leads ? `${formatCurrency(totals.spend / totals.leads, cur)} per lead` : "—"} />
            <StatCard label="Calls booked" value={formatNumber(totals.booked)} icon={CalendarCheck} footnote={totals.leads ? `${((totals.booked / totals.leads) * 100).toFixed(1)}% of leads` : "—"} />
            <StatCard label="Revenue won" value={formatCurrency(totals.revenue, cur)} icon={TrendingUp} footnote={totals.spend ? `${(totals.revenue / totals.spend).toFixed(1)}× return on spend` : "—"} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Leads by channel</CardTitle>
                <CardDescription>All campaigns</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {byChannel.map((c) => (
                    <li key={c.channel} title={`${c.channel}: ${c.leads} leads · ${c.booked} booked`}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{c.channel}</span>
                        <span className="flex items-baseline gap-2">
                          <span className="text-[11px] text-muted-foreground tabular">{c.booked} booked</span>
                          <span className="font-medium tabular">{c.leads}</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max((c.leads / maxLeads) * 100, c.leads ? 3 : 0)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="gap-0 py-0 xl:col-span-2">
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                  <TabsList className="max-w-full overflow-x-auto scrollbar-thin">
                    <TabsTrigger value="all" className="flex-none">All</TabsTrigger>
                    {(Object.keys(campaignStatusMeta) as CampaignStatus[]).map((s) => (
                      <TabsTrigger key={s} value={s} className="flex-none">
                        {campaignStatusMeta[s].label}
                      </TabsTrigger>
                    ))}
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
                    <TableHead className="text-right">Booked</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Revenue</TableHead>
                    <TableHead className="w-10 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        No campaigns here.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((c) => {
                    const used = c.budget ? Math.min((c.spend / c.budget) * 100, 100) : 0;
                    return (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => openForm(c)}>
                        <TableCell className="max-w-72 pl-4">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[c.channel, c.market, c.startDate && `${formatDate(c.startDate)}${c.endDate ? `–${formatDate(c.endDate)}` : ""}`].filter(Boolean).join(" · ")}
                          </p>
                        </TableCell>
                        <TableCell>
                          <CampaignStatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="hidden w-48 md:table-cell">
                          {c.budget ? (
                            <div className="flex items-center gap-2">
                              <Progress value={used} className="w-16" indicatorClassName={cn(used > 90 && "bg-warning")} />
                              <span className="text-xs text-muted-foreground tabular">
                                {formatCurrency(c.spend, cur, true)} / {formatCurrency(c.budget, cur, true)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{c.spend ? formatCurrency(c.spend, cur) : "—"}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular">{c.leads || "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular">{c.booked || "—"}</TableCell>
                        <TableCell className="hidden text-right tabular lg:table-cell">{c.revenue ? formatCurrency(c.revenue, cur) : "—"}</TableCell>
                        <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openForm(c)}>Update numbers</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(c)}>
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>
        </>
      )}

      <CampaignFormDialog open={formOpen} onOpenChange={setFormOpen} campaign={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={`Delete ${deleting?.name}?`}
        onConfirm={() => {
          if (deleting) remove("campaigns", deleting.id);
          toast.success("Campaign deleted");
        }}
      />
    </div>
  );
}
