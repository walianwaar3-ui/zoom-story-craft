"use client";

import * as React from "react";
import { AlertCircle, AlertTriangle, Bot, CheckCircle2, Clock, Gauge, Play, Plus, ShieldCheck, Timer, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { AgentStatusBadge } from "@/components/shared/status";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agentEvents, agents as seed, type Agent } from "@/lib/data";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const outcome = {
  success: { icon: CheckCircle2, label: "Success", className: "text-success" },
  escalated: { icon: AlertCircle, label: "Escalated", className: "text-warning" },
  failed: { icon: XCircle, label: "Failed", className: "text-destructive" },
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular">{value}</p>
    </div>
  );
}

export function AgentsView() {
  const [items, setItems] = React.useState<Agent[]>(seed);

  const update = (id: string, patch: Partial<Agent>) => setItems((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const hours = items.reduce((s, a) => s + a.hoursSavedWeek, 0);
  const runs = items.reduce((s, a) => s + a.runsToday, 0);
  const avgSuccess = Math.round(items.reduce((s, a) => s + a.successRate, 0) / items.length);
  const live = items.filter((a) => a.status === "running").length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Agents"
        description="Your AI workforce. Each agent runs inside guardrails — risky actions route to Approvals."
        actions={
          <Button size="sm" onClick={() => toast("Agent builder", { description: "Describe the job, connect tools, set guardrails." })}>
            <Plus /> New agent
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Hours saved this week" value={`${hours}h`} icon={Clock} footnote={`≈ ${(hours / 40).toFixed(1)} full-time staff`} />
        <StatCard label="Runs today" value={String(runs)} icon={Zap} footnote={`${live} of ${items.length} agents running`} />
        <StatCard label="Avg. success rate" value={`${avgSuccess}%`} icon={Gauge} footnote="Completed without human help" />
        <StatCard label="Escalations today" value={String(agentEvents.filter((e) => e.outcome === "escalated").length)} icon={ShieldCheck} footnote="Sent to Approvals" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((a) => {
          const paused = a.status === "paused";
          return (
            <Card key={a.id} className={cn("gap-4", a.status === "error" && "border-destructive/40")}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-lg",
                      a.status === "running" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Bot className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate">{a.name}</CardTitle>
                    <CardDescription className="mt-1">{a.role}</CardDescription>
                  </div>
                  <AgentStatusBadge status={a.status} />
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <p className="text-sm text-muted-foreground">{a.description}</p>

                {a.status === "error" && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 p-3 text-xs">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    <div className="flex-1">
                      <p className="font-medium text-destructive">Meta Ads API token expired</p>
                      <p className="mt-0.5 text-muted-foreground">Reconnect Meta in Settings → Integrations.</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => {
                        update(a.id, { status: "running" });
                        toast.success("Meta reconnected — Ops Reporter resumed");
                      }}
                    >
                      Fix
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3">
                  <Metric label="Runs today" value={String(a.runsToday)} />
                  <Metric label="Success" value={`${a.successRate}%`} />
                  <Metric label="Avg. time" value={a.avgHandleSeconds >= 60 ? `${Math.round(a.avgHandleSeconds / 60)}m` : `${a.avgHandleSeconds}s`} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {a.channels.map((c) => (
                    <Badge key={c} variant="outline" className="text-[11px]">
                      {c}
                    </Badge>
                  ))}
                  <Badge variant="muted" className="text-[11px]">
                    {a.model}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-3 text-sm">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span>
                      <span className="font-medium">Active</span>
                      <span className="block text-xs text-muted-foreground">
                        <Timer className="mr-1 inline size-3" />
                        Last run {relativeTime(a.lastRun)}
                      </span>
                    </span>
                    <Switch
                      checked={!paused}
                      onCheckedChange={(on) => {
                        update(a.id, { status: on ? "running" : "paused" });
                        toast(on ? `${a.name} resumed` : `${a.name} paused`);
                      }}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span>
                      <span className="font-medium">Require approval</span>
                      <span className="block text-xs text-muted-foreground">Hold outbound actions for review</span>
                    </span>
                    <Switch checked={a.needsApproval} onCheckedChange={(v) => update(a.id, { needsApproval: v })} />
                  </label>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={paused}
                  onClick={() => {
                    update(a.id, { runsToday: a.runsToday + 1, lastRun: new Date().toISOString(), status: a.status === "idle" ? "running" : a.status });
                    toast.success(`${a.name} started a run`);
                  }}
                >
                  <Play /> Run now
                </Button>
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground tabular">{a.hoursSavedWeek}h</span> saved / wk
                </span>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b">
          <CardTitle>Activity log</CardTitle>
          <CardDescription>Every action your agents took, with outcome</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Agent</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="hidden md:table-cell">Target</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="pr-5 text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agentEvents.map((e) => {
              const o = outcome[e.outcome];
              return (
                <TableRow key={e.id}>
                  <TableCell className="pl-5 font-medium">{items.find((a) => a.id === e.agentId)?.name}</TableCell>
                  <TableCell className="max-w-96 truncate text-muted-foreground">{e.action}</TableCell>
                  <TableCell className="hidden md:table-cell">{e.target}</TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", o.className)}>
                      <o.icon className="size-3.5" /> {o.label}
                    </span>
                  </TableCell>
                  <TableCell className="pr-5 text-right text-muted-foreground">{relativeTime(e.at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
