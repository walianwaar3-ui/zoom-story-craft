"use client";

import Link from "next/link";
import { CalendarClock, Globe2, Mail, MessageCircle, Phone, Wallet } from "lucide-react";

import { ClientStatusBadge, HealthMeter, PriorityLabel, regionFlag } from "@/components/shared/status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { conversations, tasks, type Client } from "@/lib/data";
import { dueLabel, formatDate, relativeTime } from "@/lib/format";
import { formatCurrency, initials } from "@/lib/utils";

function Field({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="truncate text-sm">{children}</div>
      </div>
    </div>
  );
}

export function ClientDetail({ client }: { client: Client }) {
  const clientTasks = tasks.filter((t) => t.clientId === client.id);
  const convo = conversations.find((c) => c.clientId === client.id);
  const localTime = new Intl.DateTimeFormat("en-US", {
    timeZone: client.timezone,
    timeZoneName: "short",
  })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin">
      <SheetHeader className="gap-4 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="bg-primary/15 text-base text-primary">{initials(client.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <SheetTitle className="text-lg">{client.name}</SheetTitle>
            <SheetDescription>{client.company}</SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ClientStatusBadge status={client.status} />
          <Badge variant="outline">{client.program}</Badge>
          {client.tags.map((t) => (
            <Badge key={t} variant="muted">
              {t}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" asChild>
            <Link href={convo ? `/inbox?c=${convo.id}` : "/inbox"}>
              <MessageCircle /> WhatsApp
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="flex-1" asChild>
            <a href={`mailto:${client.email}`}>
              <Mail /> Email
            </a>
          </Button>
        </div>
      </SheetHeader>

      <div className="space-y-6 p-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">MRR</p>
            <p className="mt-1 font-semibold tabular">{formatCurrency(client.mrr)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Lifetime</p>
            <p className="mt-1 font-semibold tabular">{formatCurrency(client.lifetimeValue, "USD", true)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Health</p>
            <div className="mt-1.5">
              <HealthMeter value={client.health} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-medium text-primary">Next best action</p>
          <p className="mt-1 text-sm">{client.nextAction}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field icon={Mail} label="Email">{client.email}</Field>
          <Field icon={Phone} label="Phone">{client.phone}</Field>
          <Field icon={Globe2} label="Region">
            {regionFlag(client.region)} {client.region} · <span suppressHydrationWarning>{localTime}</span>
          </Field>
          <Field icon={Wallet} label="Billing currency">{client.currency}</Field>
          <Field icon={CalendarClock} label="Client since">{formatDate(client.startedAt, { month: "short", day: "numeric", year: "numeric" })}</Field>
          <Field icon={MessageCircle} label="Last contact">{relativeTime(client.lastContact)}</Field>
        </div>

        <Separator />

        <div>
          <p className="mb-3 text-sm font-medium">Open tasks ({clientTasks.filter((t) => t.status !== "done").length})</p>
          {clientTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks linked to this client.</p>
          ) : (
            <ul className="space-y-2">
              {clientTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className={t.status === "done" ? "truncate text-sm text-muted-foreground line-through" : "truncate text-sm"}>
                      {t.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-3">
                      <PriorityLabel priority={t.priority} />
                      <span className="text-xs text-muted-foreground">{t.assignee}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{dueLabel(t.due).label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
