"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  Paperclip,
  Phone,
  Search,
  Send,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { ClientStatusBadge, HealthMeter, regionFlag } from "@/components/shared/status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { conversations as seed, getClient, type Conversation, type Message } from "@/lib/data";
import { formatDate, formatTime, relativeTime } from "@/lib/format";
import { cn, formatCurrency, initials } from "@/lib/utils";

type Filter = "all" | "unread" | "ai" | "mine";

const suggestions: Record<string, string> = {
  cv_001: "Done — testimonials will sit above pricing by this afternoon. On the mastermind: I can open 5 seats at the founder rate; sending the approval through now so we can confirm today.",
  cv_002: "Love that, Khalid — going from 8 to 20 clients is exactly what our Growth Infrastructure program is built for. Would a 20-min strategy call this week help? I have Tue 4pm or Wed 11am Dubai time.",
  cv_006: "Great questions Zainab! The program is delivered in English with Urdu support sessions. Investment starts at $2,400/month for teams up to 10. Shall we do a 20-min fit call Tuesday or Wednesday?",
  cv_008: "Hi Tom! Yes — we work with business coaches across Australia, including a Sydney academy we've helped scale their webinar funnel. What does your current client acquisition look like?",
};

function Ticks({ status }: { status?: Message["status"] }) {
  if (!status) return null;
  if (status === "sent") return <Check className="size-3.5 opacity-70" />;
  return <CheckCheck className={cn("size-3.5", status === "read" ? "text-sky-300 dark:text-sky-400" : "opacity-70")} />;
}

export function InboxView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [threads, setThreads] = React.useState<Conversation[]>(seed);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const endRef = React.useRef<HTMLDivElement>(null);

  const selectedId = params.get("c");
  const selected = threads.find((t) => t.id === selectedId) ?? null;
  // On desktop, default to the first thread so the pane is never empty.
  const active = selected ?? threads[0];

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...threads]
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .filter((t) => {
        if (filter === "unread") return t.unread > 0;
        if (filter === "ai") return t.aiHandling;
        if (filter === "mine") return t.assignedTo === "Wali";
        return true;
      })
      .filter((t) => !q || `${t.contactName} ${t.phone} ${t.messages.map((m) => m.body).join(" ")}`.toLowerCase().includes(q));
  }, [threads, filter, query]);

  const open = (id: string | null) => {
    if (id) setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
    setDraft("");
    router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
  };

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.id, active?.messages.length]);

  const send = () => {
    const body = draft.trim();
    if (!body || !active) return;
    const msg: Message = { id: `m_${active.messages.length + 1}_${body.length}`, direction: "out", body, at: new Date().toISOString(), status: "sent" };
    setThreads((ts) => ts.map((t) => (t.id === active.id ? { ...t, messages: [...t.messages, msg], lastMessageAt: msg.at, unread: 0 } : t)));
    setDraft("");
    setTimeout(() => {
      setThreads((ts) =>
        ts.map((t) =>
          t.id === active.id ? { ...t, messages: t.messages.map((m) => (m.id === msg.id ? { ...m, status: "delivered" } : m)) } : t
        )
      );
    }, 900);
  };

  const toggleAi = (value: boolean) => {
    if (!active) return;
    setThreads((ts) => ts.map((t) => (t.id === active.id ? { ...t, aiHandling: value, assignedTo: value ? "WhatsApp Concierge" : "Wali" } : t)));
    toast(value ? "WhatsApp Concierge is now handling this chat" : "You've taken over this conversation");
  };

  const client = getClient(active?.clientId);
  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100svh-3.5rem)] overflow-hidden border-t-0 lg:-mx-8 lg:-my-8">
      {/* Thread list */}
      <aside className={cn("flex w-full shrink-0 flex-col border-r bg-card md:w-80 xl:w-96", selected && "hidden md:flex")}>
        <div className="space-y-3 border-b p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">WhatsApp Inbox</h1>
            <Badge variant="success" className="gap-1.5">
              <span className="size-1.5 rounded-full bg-current" /> Connected
            </Badge>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations" className="h-8 pl-8" />
          </div>
          <div className="flex gap-1">
            {(
              [
                ["all", "All"],
                ["unread", `Unread${totalUnread ? ` · ${totalUnread}` : ""}`],
                ["ai", "AI"],
                ["mine", "Mine"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === v ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto scrollbar-thin">
          {visible.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">No conversations</li>}
          {visible.map((t) => {
            const last = t.messages.at(-1)!;
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
                  <Avatar className="size-10">
                    <AvatarFallback>{initials(t.contactName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("truncate text-sm", t.unread ? "font-semibold" : "font-medium")}>{t.contactName}</p>
                      <span className="text-xs">{regionFlag(t.region)}</span>
                      <span className={cn("ml-auto text-[11px] whitespace-nowrap", t.unread ? "font-medium text-whatsapp" : "text-muted-foreground")}>
                        {relativeTime(t.lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={cn("line-clamp-1 flex-1 text-xs", t.unread ? "text-foreground" : "text-muted-foreground")}>
                        {last.direction === "out" && (last.byAgent ? "🤖 " : "You: ")}
                        {last.body}
                      </p>
                      {t.unread > 0 && (
                        <span className="grid size-4.5 shrink-0 place-items-center rounded-full bg-whatsapp text-[10px] font-semibold text-white">
                          {t.unread}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Badge variant="muted" className="px-1.5 py-0 text-[10px]">{t.stage}</Badge>
                      {t.aiHandling && (
                        <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                          <Bot /> AI
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Conversation */}
      {active && (
        <section className={cn("flex min-w-0 flex-1 flex-col bg-background", !selected && "hidden md:flex")}>
          <div className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4">
            <Button variant="ghost" size="icon" className="-ml-2 md:hidden" onClick={() => open(null)} aria-label="Back to conversations">
              <ArrowLeft />
            </Button>
            <Avatar className="size-9">
              <AvatarFallback>{initials(active.contactName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{active.contactName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {active.phone} · {active.stage}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
              <Bot className="size-4 text-primary" />
              <span className="hidden text-xs font-medium sm:inline">AI Concierge</span>
              <Switch checked={active.aiHandling} onCheckedChange={toggleAi} aria-label="Let AI concierge handle this conversation" />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Call" onClick={() => toast("Calling via WhatsApp…")}>
                  <Phone />
                </Button>
              </TooltipTrigger>
              <TooltipContent>WhatsApp call</TooltipContent>
            </Tooltip>
          </div>

          <div
            className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin sm:px-8"
            style={{
              backgroundImage: "radial-gradient(color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              {active.messages.map((m, i) => {
                const dayOpts = { weekday: "long", month: "short", day: "numeric" } as const;
                const day = formatDate(m.at, dayOpts);
                const prev = active.messages[i - 1];
                const showDay = !prev || formatDate(prev.at, dayOpts) !== day;
                return (
                  <React.Fragment key={m.id}>
                    {showDay && (
                      <div className="my-3 self-center rounded-md bg-card px-2.5 py-1 text-[11px] text-muted-foreground shadow-xs">{day}</div>
                    )}
                    <div className={cn("flex max-w-[80%] flex-col", m.direction === "out" ? "self-end items-end" : "self-start items-start")}>
                      {m.byAgent && (
                        <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-primary">
                          <Sparkles className="size-3" /> Sent by WhatsApp Concierge
                        </span>
                      )}
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-xs",
                          m.direction === "out"
                            ? "rounded-br-md bg-[color-mix(in_oklab,var(--whatsapp)_85%,black)] text-white"
                            : "rounded-bl-md border bg-card"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <span
                          className={cn(
                            "mt-1 flex items-center justify-end gap-1 text-[10px]",
                            m.direction === "out" ? "text-white/75" : "text-muted-foreground"
                          )}
                          suppressHydrationWarning
                        >
                          {formatTime(m.at)}
                          {m.direction === "out" && <Ticks status={m.status} />}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={endRef} />
            </div>
          </div>

          <div className="shrink-0 border-t bg-card p-3 sm:p-4">
            {active.aiHandling ? (
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                <span className="flex items-center gap-2">
                  <Bot className="size-4 text-primary" />
                  WhatsApp Concierge is handling this chat. Replies with pricing go to Approvals first.
                </span>
                <Button size="sm" variant="outline" onClick={() => toggleAi(false)}>
                  Take over
                </Button>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-2">
                {suggestions[active.id] && !draft && (
                  <button
                    onClick={() => setDraft(suggestions[active.id])}
                    className="flex w-full cursor-pointer items-start gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left text-xs hover:bg-primary/10"
                  >
                    <Wand2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span className="line-clamp-2 text-muted-foreground">
                      <span className="font-medium text-primary">Suggested reply · </span>
                      {suggestions[active.id]}
                    </span>
                  </button>
                )}
                <div className="flex items-end gap-2">
                  <Button variant="ghost" size="icon" aria-label="Attach file">
                    <Paperclip />
                  </Button>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder="Type a message — Enter to send, Shift+Enter for new line"
                    className="max-h-40 min-h-10 resize-none py-2.5"
                    rows={1}
                  />
                  <Button size="icon" onClick={send} disabled={!draft.trim()} aria-label="Send message" className="bg-whatsapp text-white hover:bg-whatsapp/90">
                    <Send />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Context panel */}
      {active && (
        <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l bg-card scrollbar-thin 2xl:flex">
          <div className="flex flex-col items-center gap-2 border-b p-6 text-center">
            <Avatar className="size-16">
              <AvatarFallback className="bg-primary/15 text-lg text-primary">{initials(active.contactName)}</AvatarFallback>
            </Avatar>
            <p className="font-semibold">{active.contactName}</p>
            <p className="text-xs text-muted-foreground">
              {regionFlag(active.region)} {active.region} · {active.phone}
            </p>
          </div>
          <div className="space-y-5 p-5 text-sm">
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Conversation</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stage</span>
                <span>{active.stage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assigned</span>
                <span>{active.assignedTo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Messages</span>
                <span className="tabular">{active.messages.length}</span>
              </div>
            </div>
            <Separator />
            {client ? (
              <div className="space-y-3">
                <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Client record</p>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <ClientStatusBadge status={client.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">MRR</span>
                  <span className="font-medium tabular">{formatCurrency(client.mrr)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Health</span>
                  <HealthMeter value={client.health} />
                </div>
                <div className="rounded-md bg-muted/60 p-3 text-xs">
                  <p className="font-medium">Next action</p>
                  <p className="mt-0.5 text-muted-foreground">{client.nextAction}</p>
                </div>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href={`/clients?client=${client.id}`}>
                    <UserRound /> Open client profile
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Lead</p>
                <p className="text-muted-foreground">Not yet a client. Qualify and book a strategy call to move them forward.</p>
                <Button size="sm" className="w-full" onClick={() => toast.success(`${active.contactName} added to GoHighLevel pipeline`)}>
                  Add to pipeline
                </Button>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
