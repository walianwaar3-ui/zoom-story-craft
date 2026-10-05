import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  GitBranch,
  MessageCircle,
  Plus,
  Users,
  XCircle,
  AlertCircle,
} from "lucide-react";

import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PageHeader } from "@/components/layout/page-header";
import { HealthMeter, PriorityLabel, regionFlag } from "@/components/shared/status";
import { StatCard } from "@/components/shared/stat-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { agentEvents, agents, approvals, clients, conversations, kpis, tasks } from "@/lib/data";
import { dueLabel, formatDate, relativeTime } from "@/lib/format";
import { MOCK_NOW } from "@/lib/data/team";
import { cn, formatCurrency, initials } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

const outcomeIcon = {
  success: { icon: CheckCircle2, className: "text-success" },
  escalated: { icon: AlertCircle, className: "text-warning" },
  failed: { icon: XCircle, className: "text-destructive" },
};

export default function DashboardPage() {
  const pending = approvals.filter((a) => a.status === "pending");
  const todayTasks = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 5);
  const atRisk = clients.filter((c) => c.status === "at-risk" || c.health < 60).filter((c) => c.status !== "churned");
  const unreadThreads = conversations.filter((c) => c.unread > 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Good morning, Wali"
        description={`${formatDate(MOCK_NOW.toISOString(), { weekday: "long", month: "long", day: "numeric" })} · ${pending.length} decisions and ${unreadThreads.length} conversations need you today.`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download /> Export
            </Button>
            <Button size="sm" asChild>
              <Link href="/clients">
                <Plus /> New client
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Monthly recurring revenue" value={formatCurrency(kpis.mrr)} change={kpis.mrrChange} icon={DollarSign} />
        <StatCard label="Open pipeline value" value={formatCurrency(kpis.pipelineValue, "USD", true)} change={kpis.pipelineChange} icon={GitBranch} />
        <StatCard label="Active clients" value={String(kpis.activeClients)} change={kpis.activeClientsChange} changeUnit="" changeLabel="new this month" icon={Users} />
        <StatCard label="Avg. WhatsApp first reply" value={`${kpis.responseTimeSeconds}s`} change={kpis.responseTimeChange} invert icon={Clock} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Monthly recurring revenue</CardTitle>
            <CardDescription>Last 12 months · all currencies normalised to USD</CardDescription>
            <CardAction>
              <Badge variant="success">+103% YoY</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <RevenueChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acquisition pipeline</CardTitle>
            <CardDescription>Last 30 days · stage conversion</CardDescription>
          </CardHeader>
          <CardContent>
            <PipelineFunnel />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Waiting on your approval</CardTitle>
            <CardDescription>{pending.length} items · oldest {relativeTime(pending.at(-1)!.createdAt)}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/approvals">
                  Review <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            {pending.slice(0, 4).map((a) => (
              <Link key={a.id} href="/approvals" className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    a.risk === "high" ? "bg-destructive" : a.risk === "medium" ? "bg-warning" : "bg-success"
                  )}
                  title={`${a.risk} risk`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.type} · {a.requestedBy}
                    {a.requestedByAgent && " (agent)"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{relativeTime(a.createdAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Priority tasks</CardTitle>
            <CardDescription>Across the team, by due date</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/tasks">
                  Board <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            {todayTasks.map((t) => {
              const due = dueLabel(t.due);
              return (
                <div key={t.id} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                  <Avatar className="size-6">
                    <AvatarFallback className="text-[10px]">{initials(t.assignee)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.title}</p>
                    <PriorityLabel priority={t.priority} />
                  </div>
                  <span
                    className={cn(
                      "text-xs whitespace-nowrap",
                      due.tone === "overdue" && "font-medium text-destructive",
                      due.tone === "today" && "font-medium text-warning",
                      (due.tone === "soon" || due.tone === "later") && "text-muted-foreground"
                    )}
                  >
                    {due.label}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Agent activity</CardTitle>
            <CardDescription>
              {agents.filter((a) => a.status === "running").length} running · {agents.reduce((s, a) => s + a.runsToday, 0)} runs today
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/agents">
                  Agents <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-border">
              {agentEvents.slice(0, 5).map((e) => {
                const agent = agents.find((a) => a.id === e.agentId);
                const o = outcomeIcon[e.outcome];
                return (
                  <li key={e.id} className="relative flex gap-3 pl-0">
                    <o.icon className={cn("relative z-10 mt-0.5 size-[15px] shrink-0 rounded-full bg-card", o.className)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <span className="font-medium">{agent?.name}</span>{" "}
                        <span className="text-muted-foreground">{e.action.charAt(0).toLowerCase() + e.action.slice(1)}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.target} · {relativeTime(e.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Accounts needing attention</CardTitle>
            <CardDescription>Health below 60 or flagged at risk</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/clients">
                  All clients <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            {atRisk.map((c) => (
              <Link key={c.id} href={`/clients?client=${c.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/60">
                <Avatar className="size-8">
                  <AvatarFallback>{initials(c.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c.name} <span className="font-normal">{regionFlag(c.region)}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{c.nextAction}</p>
                </div>
                <HealthMeter value={c.health} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unread on WhatsApp</CardTitle>
            <CardDescription>
              {unreadThreads.reduce((s, c) => s + c.unread, 0)} messages across {unreadThreads.length} conversations
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/inbox">
                  Inbox <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            {unreadThreads.map((c) => {
              const last = c.messages.at(-1)!;
              return (
                <Link key={c.id} href={`/inbox?c=${c.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/60">
                  <div className="relative">
                    <Avatar className="size-8">
                      <AvatarFallback>{initials(c.contactName)}</AvatarFallback>
                    </Avatar>
                    <MessageCircle className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-card text-whatsapp" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {c.contactName}
                      {c.aiHandling && (
                        <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                          <Bot /> AI
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{last.body}</p>
                  </div>
                  <span className="grid size-5 place-items-center rounded-full bg-whatsapp text-[10px] font-semibold text-white">
                    {c.unread}
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
