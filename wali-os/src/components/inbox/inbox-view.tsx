"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  CheckCheck,
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  MailPlus,
  MoreHorizontal,
  RotateCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ClientStatusBadge, HealthBadge, ThreadStatusBadge } from "@/components/shared/status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { EmailThread, OutboxItem, ThreadStatus } from "@/lib/data/types";
import { emailPreview } from "@/lib/email-clean";
import { mailtoHref, relativeTime } from "@/lib/format";
import { usePeople, useStore } from "@/lib/store";
import { cn, formatCurrency, initials } from "@/lib/utils";
import {
  approvedReplyFor,
  cancelQueuedReply,
  logInbound,
  markReplySent,
  pendingReplyFor,
  queueReply,
  retryQueuedReply,
  submitReplyForApproval,
} from "@/lib/workflows";

import { LogEmailDialog } from "./log-email-dialog";
import { MessageBubble, dayLabel } from "./message-bubble";

type Filter = "all" | ThreadStatus;
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs-reply", label: "Needs reply" },
  { value: "awaiting-approval", label: "In approval" },
  { value: "ready-to-send", label: "Ready to send" },
  { value: "replied", label: "Replied" },
  { value: "closed", label: "Closed" },
];

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied to clipboard"),
    () => toast.error("Couldn't copy — select the text and copy manually")
  );
}

function SendPanel({ thread, body, onSent }: { thread: EmailThread; body: string; onSent: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild className="bg-success text-white hover:bg-success/90">
        <a href={mailtoHref(thread.contactEmail, thread.subject, body)}>
          <ExternalLink /> Open in email app
        </a>
      </Button>
      <Button variant="outline" onClick={() => copy(body)}>
        <Copy /> Copy text
      </Button>
      <Button variant="outline" onClick={onSent}>
        <CheckCheck /> Mark as sent
      </Button>
    </div>
  );
}

/** A reply in Hermes's hands: queued, being sent from Gmail, or failed. */
function PendingReply({ item, onCancel, onRetry }: { item: OutboxItem; onCancel: () => void; onRetry: () => void }) {
  const failed = item.status === "failed";
  return (
    <div className={cn("space-y-3 rounded-lg border p-4", failed ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5")}>
      <p className="flex items-center gap-2 text-sm font-medium">
        {failed ? (
          <>
            <AlertTriangle className="size-4 text-destructive" /> Gmail send failed
          </>
        ) : (
          <>
            <Loader2 className="size-4 animate-spin text-primary" /> {item.status === "sending" ? "Hermes is sending it from Gmail…" : "Queued for Hermes to send from Gmail"}
          </>
        )}
      </p>
      <p className="max-h-32 overflow-y-auto rounded-md border bg-background p-3 text-sm whitespace-pre-wrap scrollbar-thin">{item.body}</p>
      {failed && item.error && <p className="text-xs text-destructive">{item.error}</p>}
      <div className="flex flex-wrap gap-2">
        {failed && (
          <Button size="sm" onClick={onRetry}>
            <RotateCw /> Retry
          </Button>
        )}
        {item.status !== "sending" && (
          <Button size="sm" variant="outline" onClick={onCancel}>
            <X /> Cancel
          </Button>
        )}
      </div>
      {!failed && <p className="text-xs text-muted-foreground">It appears in the conversation as soon as Gmail has sent it.</p>}
    </div>
  );
}

export function InboxView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { db, update, remove, transact, mode } = useStore();
  // Sending through Gmail needs the cloud workspace, where Hermes picks up the outbox.
  const viaGmail = mode === "cloud";
  const { owner } = usePeople();

  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [logOpen, setLogOpen] = React.useState(params.get("new") === "1");
  const [inboundOpen, setInboundOpen] = React.useState(false);
  const [inboundText, setInboundText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  const logDefaults = React.useMemo(
    () => ({ name: params.get("name") ?? undefined, email: params.get("email") ?? undefined, clientId: params.get("client") ?? undefined }),
    [params]
  );

  const threads = React.useMemo(() => [...db.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [db.threads]);
  const selectedId = params.get("t");
  const selected = threads.find((t) => t.id === selectedId);
  const active = selected ?? threads[0];

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads
      .filter((t) => filter === "all" || t.status === filter)
      .filter((t) => !q || `${t.contactName} ${t.contactEmail} ${t.subject} ${t.messages.map((m) => m.body).join(" ")}`.toLowerCase().includes(q));
  }, [threads, filter, query]);

  const count = (f: Filter) => (f === "all" ? threads.length : threads.filter((t) => t.status === f).length);

  const open = (id: string | null) => router.replace(id ? `${pathname}?t=${id}` : pathname, { scroll: false });

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.id, active?.messages.length]);

  const client = active ? db.clients.find((c) => c.id === active.clientId || (c.email && c.email.toLowerCase() === active.contactEmail.toLowerCase())) : undefined;
  const approval = active ? approvedReplyFor(db, active) : undefined;
  const draft = active?.draft ?? "";
  const pending = active ? pendingReplyFor(db, active.id) : undefined;

  const sendViaGmail = (body: string, approvalId?: string) => {
    if (!active || !body.trim()) return;
    transact((d) => queueReply(d, active.id, body, owner, approvalId));
    toast.success("Queued for Gmail", { description: "Hermes sends it from your Gmail within a minute or two." });
  };

  const submit = () => {
    if (!active || !draft.trim()) return;
    transact((d) => submitReplyForApproval(d, active.id, draft.trim(), owner));
    toast.success("Reply sent to Approvals", { description: "Approve it there, then send it from here." });
  };

  const sent = (body: string) => {
    if (!active) return;
    transact((d) => markReplySent(d, active.id, body));
    toast.success("Marked as sent");
  };

  const lastIncoming = active?.messages.filter((m) => m.direction === "in").at(-1);

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100svh-3.5rem)] overflow-hidden lg:-mx-8 lg:-my-8">
      {/* Thread list */}
      <aside className={cn("flex w-full shrink-0 flex-col border-r bg-card md:w-80 xl:w-96", selected && "hidden md:flex")}>
        <div className="space-y-3 border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Email Inbox</h1>
            <Button size="sm" onClick={() => setLogOpen(true)}>
              <MailPlus /> Log email
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search emails" className="h-8 pl-8" />
          </div>
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === f.value ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {f.label}
                {f.value !== "all" && count(f.value) > 0 && <span className="ml-1 tabular opacity-80">{count(f.value)}</span>}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto scrollbar-thin">
          {threads.length === 0 ? (
            <li>
              <EmptyState
                icon={Inbox}
                title="No emails yet"
            highlight
                description="Log an email you received, draft your reply, and send it for approval before it goes out."
                action={
                  <Button size="sm" onClick={() => setLogOpen(true)}>
                    <MailPlus /> Log your first email
                  </Button>
                }
              />
            </li>
          ) : visible.length === 0 ? (
            <li className="p-8 text-center text-sm text-muted-foreground">Nothing here.</li>
          ) : (
            visible.map((t) => {
              const last = t.messages.at(-1);
              const isActive = t.id === active?.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => open(t.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      isActive && "bg-muted/70 md:shadow-[inset_2px_0_0_var(--primary)]"
                    )}
                  >
                    <Avatar className="size-9">
                      <AvatarFallback>{initials(t.contactName || t.contactEmail)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn("truncate text-sm", t.status === "needs-reply" ? "font-semibold" : "font-medium")}>
                          {t.contactName || t.contactEmail}
                        </p>
                        <span className="ml-auto text-[11px] whitespace-nowrap text-muted-foreground">{relativeTime(t.updatedAt)}</span>
                      </div>
                      <p className="truncate text-xs font-medium">{t.subject || "(no subject)"}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {last?.direction === "out" && "You: "}
                        {last ? emailPreview(last.body) : ""}
                      </p>
                      <ThreadStatusBadge status={t.status} className="mt-1.5 px-1.5 py-0 text-[10px]" />
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Conversation */}
      {active ? (
        <section className={cn("flex min-w-0 flex-1 flex-col bg-background", !selected && "hidden md:flex")}>
          <div className="flex min-h-16 shrink-0 items-center gap-3 border-b bg-card px-4 py-2">
            <Button variant="ghost" size="icon" className="-ml-2 md:hidden" onClick={() => open(null)} aria-label="Back to emails">
              <ArrowLeft />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{active.subject || "(no subject)"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {active.contactName ? `${active.contactName} · ` : ""}
                {active.contactEmail}
              </p>
            </div>
            <ThreadStatusBadge status={active.status} className="hidden sm:inline-flex" />
            <Button variant="outline" size="sm" onClick={() => setInboundOpen(true)}>
              <Mail /> <span className="hidden sm:inline">Log their reply</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Email actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {active.status === "closed" ? (
                  <DropdownMenuItem onClick={() => update("threads", active.id, { status: "needs-reply" })}>
                    <Mail /> Reopen
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => update("threads", active.id, { status: "closed" })}>
                    <Archive /> Close (no reply needed)
                  </DropdownMenuItem>
                )}
                {client && (
                  <DropdownMenuItem asChild>
                    <Link href={`/clients?client=${client.id}`}>
                      <UserRound /> Open client
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin sm:px-8">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {[...active.messages]
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((m, i, all) => {
                  const newDay = i === 0 || new Date(all[i - 1].at).toDateString() !== new Date(m.at).toDateString();
                  return (
                    <React.Fragment key={m.id}>
                      {newDay && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator">
                          <span className="h-px flex-1 bg-border" />
                          {dayLabel(m.at)}
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <MessageBubble message={m} contactName={active.contactName} contactEmail={active.contactEmail} ownerName={owner} />
                    </React.Fragment>
                  );
                })}
              <div ref={endRef} />
            </div>
          </div>

          <div className="shrink-0 border-t bg-card p-3 sm:p-4">
            <div className="mx-auto max-w-3xl">
              {pending ? (
                <PendingReply
                  item={pending}
                  onCancel={() => {
                    transact((d) => cancelQueuedReply(d, pending.id));
                    toast.info("Send cancelled", { description: pending.approvalId ? undefined : "Your text is back in the reply box." });
                  }}
                  onRetry={() => {
                    transact((d) => retryQueuedReply(d, pending.id));
                    toast.success("Queued again");
                  }}
                />
              ) : active.status === "awaiting-approval" ? (
                <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm sm:flex-row sm:items-center">
                  <ShieldCheck className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Reply is waiting for approval</p>
                    {approval && <p className="line-clamp-2 text-muted-foreground">{approval.content}</p>}
                  </div>
                  <Button size="sm" asChild>
                    <Link href={`/approvals?id=${active.approvalId ?? ""}`}>Review in Approvals</Link>
                  </Button>
                </div>
              ) : active.status === "ready-to-send" && approval ? (
                <div className="space-y-3 rounded-lg border border-success/40 bg-success/8 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CheckCheck className="size-4 text-success" /> Approved reply, ready to send
                  </p>
                  <p className="max-h-32 overflow-y-auto rounded-md border bg-background p-3 text-sm whitespace-pre-wrap scrollbar-thin">{approval.content}</p>
                  {viaGmail && (
                    <Button onClick={() => sendViaGmail(approval.content, approval.id)}>
                      <Send /> Send via Gmail
                    </Button>
                  )}
                  <SendPanel thread={active} body={approval.content} onSent={() => sent(approval.content)} />
                  <p className="text-xs text-muted-foreground">
                    {viaGmail ? "“Send via Gmail” has Hermes send it from your Gmail, in the same conversation. " : ""}
                    “Open in email app” fills in a new email in your own mail program. Send it there, then click “Mark as sent”.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => update("threads", active.id, { draft: e.target.value })}
                    placeholder={`Write your reply to ${active.contactName || active.contactEmail}…`}
                    className="max-h-60 min-h-24 resize-y"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Drafts are saved automatically.</p>
                    <div className="flex gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={!draft.trim()}>
                            More
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {viaGmail && (
                            <DropdownMenuItem onClick={submit}>
                              <ShieldCheck /> Submit for approval instead
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <a href={mailtoHref(active.contactEmail, active.subject, draft.trim())} onClick={() => sent(draft.trim())}>
                              <ExternalLink /> Send from my email app
                            </a>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {viaGmail ? (
                        <Button size="sm" onClick={() => sendViaGmail(draft)} disabled={!draft.trim()}>
                          <Send /> Send via Gmail
                        </Button>
                      ) : (
                        <Button size="sm" onClick={submit} disabled={!draft.trim()}>
                          <ShieldCheck /> Submit for approval
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="hidden flex-1 place-items-center md:grid">
          <p className="text-sm text-muted-foreground">Select or log an email.</p>
        </section>
      )}

      {/* Context panel */}
      {active && (
        <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l bg-card scrollbar-thin 2xl:flex">
          <div className="flex flex-col items-center gap-2 border-b p-6 text-center">
            <Avatar className="size-14">
              <AvatarFallback className="bg-primary/15 text-lg text-primary">{initials(active.contactName || active.contactEmail)}</AvatarFallback>
            </Avatar>
            <p className="font-semibold">{active.contactName || active.contactEmail}</p>
            <p className="text-xs text-muted-foreground">{active.contactEmail}</p>
          </div>
          <div className="space-y-5 p-5 text-sm">
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Conversation</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Messages</span>
                <span className="tabular">{active.messages.length}</span>
              </div>
              {lastIncoming && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last received</span>
                  <span>{relativeTime(lastIncoming.at)}</span>
                </div>
              )}
            </div>
            <Separator />
            {client ? (
              <div className="space-y-3">
                <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Client</p>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <ClientStatusBadge status={client.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Monthly</span>
                  <span className="font-medium tabular">{formatCurrency(client.mrr, db.settings.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Health</span>
                  <HealthBadge health={client.health} />
                </div>
                {client.nextAction && (
                  <div className="rounded-md bg-muted/60 p-3 text-xs">
                    <p className="font-medium">Next action</p>
                    <p className="mt-0.5 text-muted-foreground">{client.nextAction}</p>
                  </div>
                )}
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href={`/clients?client=${client.id}`}>
                    <UserRound /> Open client profile
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Not a client yet</p>
                <p className="text-muted-foreground">Add this contact to Clients as a lead to track them.</p>
                <Button size="sm" variant="outline" className="w-full" asChild>
                  <Link href="/clients">Go to Clients</Link>
                </Button>
              </div>
            )}
          </div>
        </aside>
      )}

      <LogEmailDialog open={logOpen} onOpenChange={setLogOpen} defaults={logDefaults} onCreated={(id) => open(id)} />

      <Dialog open={inboundOpen} onOpenChange={(o) => { setInboundOpen(o); if (!o) setInboundText(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log their reply</DialogTitle>
            <DialogDescription>Paste the new message from {active?.contactName || active?.contactEmail}.</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus value={inboundText} onChange={(e) => setInboundText(e.target.value)} className="min-h-36" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInboundOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!inboundText.trim()}
              onClick={() => {
                if (!active) return;
                transact((d) => logInbound(d, active.id, inboundText.trim()));
                setInboundOpen(false);
                setInboundText("");
                toast.success("Message added");
              }}
            >
              Add message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this email conversation?"
        description="All logged messages in it will be removed."
        onConfirm={() => {
          if (!active) return;
          remove("threads", active.id);
          open(null);
          toast.success("Conversation deleted");
        }}
      />
    </div>
  );
}
