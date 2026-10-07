"use client";

import Link from "next/link";
import { CalendarClock, Globe2, Mail, Pencil, Phone, Trash2, Wallet } from "lucide-react";

import { ClientStatusBadge, HealthBadge, PriorityLabel, ThreadStatusBadge } from "@/components/shared/status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { serviceTotals } from "@/lib/client-value";
import { emailPreview } from "@/lib/email-clean";
import type { Client } from "@/lib/data/types";
import { dueLabel, formatDate, relativeTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { formatCurrency, initials } from "@/lib/utils";

import { ClientMeetings } from "./client-meetings";
import { ClientServices } from "./client-services";

function Field({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="truncate text-sm">{children || <span className="text-muted-foreground">—</span>}</div>
      </div>
    </div>
  );
}

export function ClientDetail({ client, onEdit, onDelete }: { client: Client; onEdit: () => void; onDelete: () => void }) {
  const { db } = useStore();
  const clientTasks = db.tasks.filter((t) => t.clientId === client.id);
  const threads = db.threads
    .filter((t) => t.clientId === client.id || (client.email && t.contactEmail.toLowerCase() === client.email.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const totals = serviceTotals(db.services.filter((s) => s.clientId === client.id));

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin">
      <SheetHeader className="gap-4 border-b pr-12">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="bg-primary/15 text-base text-primary">{initials(client.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <SheetTitle className="text-lg">{client.name}</SheetTitle>
            <SheetDescription>{client.company || "No company"}</SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ClientStatusBadge status={client.status} />
          {client.program && <Badge variant="outline">{client.program}</Badge>}
          {client.tags.map((t) => (
            <Badge key={t} variant="muted">
              {t}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" asChild>
            <Link href={`/inbox?new=1&email=${encodeURIComponent(client.email)}&name=${encodeURIComponent(client.name)}&client=${client.id}`}>
              <Mail /> Log email
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          <Button size="icon-sm" variant="outline" onClick={onDelete} aria-label="Delete client">
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </SheetHeader>

      <Tabs defaultValue="overview" className="gap-0">
        <TabsList className="mx-5 mt-4 w-auto self-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="emails">Emails{threads.length > 0 && ` (${threads.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 p-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Monthly</p>
            <p className="mt-1 font-semibold tabular">{formatCurrency(client.mrr, db.settings.currency)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Lifetime paid</p>
            <p className="mt-1 font-semibold tabular">{formatCurrency(totals.paid, db.settings.currency)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Health</p>
            <div className="mt-1.5">
              <HealthBadge health={client.health} />
            </div>
          </div>
        </div>

        {client.nextAction && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-medium text-primary">Next action</p>
            <p className="mt-1 text-sm">{client.nextAction}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field icon={Mail} label="Email">{client.email}</Field>
          <Field icon={Phone} label="Phone">{client.phone}</Field>
          <Field icon={Globe2} label="Country">{client.country}</Field>
          <Field icon={Wallet} label="Owner">{client.owner}</Field>
          <Field icon={CalendarClock} label="Added">{formatDate(client.createdAt, { month: "short", day: "numeric", year: "numeric" })}</Field>
          <Field icon={Mail} label="Last contact">{client.lastContact ? relativeTime(client.lastContact) : ""}</Field>
        </div>

        {client.notes && (
          <div>
            <p className="mb-1.5 text-sm font-medium">Notes</p>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{client.notes}</p>
          </div>
        )}

        <div>
          <p className="mb-3 text-sm font-medium">Tasks ({clientTasks.filter((t) => t.status !== "done").length} open)</p>
          {clientTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks linked to this client.</p>
          ) : (
            <ul className="space-y-2">
              {clientTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className={t.status === "done" ? "truncate text-sm text-muted-foreground line-through" : "truncate text-sm"}>{t.title}</p>
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
        </TabsContent>

        <TabsContent value="services" className="p-5">
          <ClientServices client={client} />
        </TabsContent>

        <TabsContent value="meetings" className="p-5">
          <ClientMeetings client={client} />
        </TabsContent>

        <TabsContent value="emails" className="p-5">
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails yet. Threads from {client.email || "this client's address"} link here automatically.</p>
          ) : (
            <ul className="space-y-2">
              {threads.map((t) => {
                const last = t.messages.at(-1);
                return (
                  <li key={t.id}>
                    <Link href={`/inbox?t=${t.id}`} className="block rounded-md border px-3 py-2 hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.subject || "(no subject)"}</span>
                        <ThreadStatusBadge status={t.status} />
                      </div>
                      {last && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{last.direction === "in" ? client.name.split(" ")[0] || "Them" : "You"}</span> · {relativeTime(last.at)}: {emailPreview(last.body)}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
