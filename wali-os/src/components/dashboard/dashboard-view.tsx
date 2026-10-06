"use client";

import Link from "next/link";
import { ArrowRight, CheckCheck, CheckCircle2, Circle, DollarSign, Mail, Plus, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Swoosh } from "@/components/shared/swoosh";
import { HealthBadge, PriorityLabel, ThreadStatusBadge, clientStatusMeta } from "@/components/shared/status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClientStatus } from "@/lib/data/types";
import { dueLabel, formatDate, relativeTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cn, formatCurrency, initials } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href={href}>
        {label} <ArrowRight />
      </Link>
    </Button>
  );
}

export function DashboardView() {
  const { db } = useStore();
  const cur = db.settings.currency;

  const pending = [...db.approvals].filter((a) => a.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const emailQueue = db.threads
    .filter((t) => t.status === "needs-reply" || t.status === "ready-to-send")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const openTasks = db.tasks.filter((t) => t.status !== "done").sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
  const revenueClients = db.clients.filter((c) => c.status === "active" || c.status === "onboarding");
  const mrr = revenueClients.reduce((s, c) => s + c.mrr, 0);
  const attention = db.clients.filter((c) => c.status !== "churned" && c.health !== "good");
  const statusCounts = (Object.keys(clientStatusMeta) as ClientStatus[]).map((s) => ({ status: s, count: db.clients.filter((c) => c.status === s).length }));
  const maxStatus = Math.max(1, ...statusCounts.map((s) => s.count));

  const steps = [
    { done: !!db.settings.ownerName, label: "Add your name and business", href: "/settings" },
    { done: db.clients.length > 0, label: "Add your first client or lead", href: "/clients" },
    { done: db.threads.length > 0, label: "Log an email and draft a reply", href: "/inbox" },
    { done: db.tasks.length > 0, label: "Create a task", href: "/tasks" },
  ];
  const setupDone = steps.every((s) => s.done);
  const name = db.settings.ownerName.split(" ")[0];

  const dueNow = openTasks.filter((t) => ["overdue", "today"].includes(dueLabel(t.due).tone)).length;
  const summary = [
    pending.length && `${pending.length} approval${pending.length === 1 ? "" : "s"}`,
    emailQueue.length && `${emailQueue.length} email${emailQueue.length === 1 ? "" : "s"}`,
    dueNow && `${dueNow} task${dueNow === 1 ? "" : "s"} due`,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Hero band: soft brand gradient behind the greeting, wave into the canvas. */}
      <div className="relative isolate -mx-4 -mt-6 px-4 pt-6 pb-10 lg:-mx-8 lg:-mt-8 lg:px-8 lg:pt-8">
        <div className="bg-hero absolute inset-0 -z-10 opacity-60" aria-hidden />
        <svg className="absolute inset-x-0 bottom-0 -z-10 h-8 w-full text-background" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 22 C 200 4, 420 38, 640 22 S 1020 6, 1200 20 V40 H0 Z" fill="currentColor" />
        </svg>
        <PageHeader
          title={
            <>
              {greeting()}
              {name ? (
                <>
                  , <Swoosh>{name}</Swoosh>
                </>
              ) : null}
            </>
          }
          description={`${formatDate(new Date().toISOString(), { weekday: "long", month: "long", day: "numeric" })} · ${
            summary.length ? `Waiting on you: ${summary.join(", ")}.` : "Nothing urgent waiting on you."
          }`}
          actions={
            <Button asChild>
              <Link href="/inbox?new=1">
                <Plus /> Log email
              </Link>
            </Button>
          }
        />
      </div>

      {!setupDone && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Set up Wali OS</CardTitle>
            <CardDescription>
              {steps.filter((s) => s.done).length} of {steps.length} done. Your data stays in this browser, so back it up from Settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className={cn("flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50", s.done && "text-muted-foreground")}
              >
                {s.done ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-brand-border" />}
                <span className={cn(s.done && "line-through")}>{s.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard accent label="Monthly revenue" value={formatCurrency(mrr, cur)} icon={DollarSign} footnote={`From ${revenueClients.length} active & onboarding`} />
        <StatCard
          label="Clients"
          value={String(db.clients.filter((c) => c.status === "active").length)}
          icon={Users}
          footnote={`active · ${db.clients.filter((c) => c.status === "lead").length} leads`}
        />
        <StatCard
          label="Emails to handle"
          value={String(emailQueue.length)}
          icon={Mail}
          footnote={`${db.threads.filter((t) => t.status === "ready-to-send").length} approved, ready to send`}
        />
        <StatCard label="Pending approvals" value={String(pending.length)} icon={CheckCheck} footnote={pending[0] ? `Oldest ${relativeTime(pending[0].createdAt)}` : "All clear"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Waiting on your approval</CardTitle>
            <CardDescription>Oldest first</CardDescription>
            <CardAction>
              <SectionLink href="/approvals" label="Review" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            {pending.length === 0 ? (
              <EmptyState icon={CheckCheck} title="Nothing to approve" className="py-8" />
            ) : (
              pending.slice(0, 5).map((a) => (
                <Link key={a.id} href={`/approvals?id=${a.id}`} className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                  <span
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.risk === "high" ? "bg-destructive" : a.risk === "medium" ? "bg-warning" : "bg-success")}
                    title={`${a.risk} risk`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.type} · {a.requestedBy}
                    </p>
                  </div>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">{relativeTime(a.createdAt)}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emails to handle</CardTitle>
            <CardDescription>Needs a reply, or approved and ready to send</CardDescription>
            <CardAction>
              <SectionLink href="/inbox" label="Inbox" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            {emailQueue.length === 0 ? (
              <EmptyState icon={Mail} title="Inbox zero" className="py-8" />
            ) : (
              emailQueue.slice(0, 5).map((t) => (
                <Link key={t.id} href={`/inbox?t=${t.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                  <Avatar className="size-8">
                    <AvatarFallback>{initials(t.contactName || t.contactEmail)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.contactName || t.contactEmail}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.subject || "(no subject)"}</p>
                  </div>
                  <ThreadStatusBadge status={t.status} className="px-1.5 py-0 text-[10px]" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Upcoming tasks</CardTitle>
            <CardDescription>{openTasks.length} open, by due date</CardDescription>
            <CardAction>
              <SectionLink href="/tasks" label="Board" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1">
            {openTasks.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No open tasks" className="py-8" />
            ) : (
              openTasks.slice(0, 5).map((t) => {
                const due = dueLabel(t.due);
                return (
                  <Link key={t.id} href="/tasks" className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
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
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Client pipeline</CardTitle>
            <CardDescription>{db.clients.length} record{db.clients.length === 1 ? "" : "s"} by status</CardDescription>
            <CardAction>
              <SectionLink href="/clients" label="Clients" />
            </CardAction>
          </CardHeader>
          <CardContent>
            {db.clients.length === 0 ? (
              <EmptyState icon={Users} title="No clients yet" className="py-8" />
            ) : (
              <ul className="space-y-3.5">
                {statusCounts.map((s) => (
                  <li key={s.status}>
                    <div className="mb-1.5 flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">{clientStatusMeta[s.status].label}</span>
                      <span className="font-medium tabular">{s.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-1" style={{ width: `${(s.count / maxStatus) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clients needing attention</CardTitle>
            <CardDescription>Health set to Watch or At risk</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {attention.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Everyone looks healthy" className="py-8" />
            ) : (
              attention.map((c) => (
                <Link key={c.id} href={`/clients?client=${c.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/60">
                  <Avatar className="size-8">
                    <AvatarFallback>{initials(c.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.nextAction || "No next action set"}</p>
                  </div>
                  <HealthBadge health={c.health} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
