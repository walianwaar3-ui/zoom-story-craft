"use client";

import * as React from "react";
import { Bot, Loader2, Send } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Agent } from "@/lib/data/types";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export function AgentAvatar({ agent, className }: { agent: Pick<Agent, "name" | "avatarUrl" | "status">; className?: string }) {
  return (
    <Avatar className={cn("size-10 rounded-lg", className)}>
      {agent.avatarUrl ? <AvatarImage src={agent.avatarUrl} alt={agent.name} className="object-cover" /> : null}
      <AvatarFallback className={cn("rounded-lg", agent.status === "active" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>
        <Bot className="size-5" />
      </AvatarFallback>
    </Avatar>
  );
}

/** Chat with an agent through /api/agents/:id/chat, signed in as the current user. */
export function AgentChatSheet({ agent, open, onOpenChange }: { agent?: Agent; open: boolean; onOpenChange: (o: boolean) => void }) {
  // One conversation per agent, kept while the page is open.
  const [threads, setThreads] = React.useState<Record<string, Msg[]>>({});
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const messages = agent ? (threads[agent.id] ?? []) : [];

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!agent || !text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setThreads((t) => ({ ...t, [agent.id]: next }));
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error("Sign in to Wali OS cloud mode to chat with agents.");
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        // Keep the request small: the last 20 turns are plenty of memory.
        body: JSON.stringify({ messages: next.slice(-20) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setThreads((t) => ({ ...t, [agent.id]: [...next, { role: "assistant", content: String(data.reply || "(no reply)") }] }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {agent && (
          <>
            <SheetHeader className="flex-row items-center gap-3 border-b pr-12">
              <AgentAvatar agent={agent} />
              <div className="min-w-0">
                <SheetTitle className="truncate">{agent.name}</SheetTitle>
                <SheetDescription className="line-clamp-1">{agent.role || "Agent"}</SheetDescription>
              </div>
            </SheetHeader>
            <div className="flex-1 space-y-3 overflow-y-auto p-5" aria-live="polite">
              {messages.length === 0 && (
                <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  {agent.name} sees your live Wali OS data (clients, tasks, approvals, emails, campaigns). Ask for a status, a plan or a draft. It advises
                  and drafts here; actions still go through Approvals.
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> {agent.name} is thinking…
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="flex items-end gap-2 border-t p-4">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={agent.status === "active" ? `Message ${agent.name}…` : `${agent.name} is paused`}
                disabled={agent.status !== "active"}
                className="max-h-40 min-h-10"
                aria-label={`Message ${agent.name}`}
              />
              <Button type="submit" size="icon" disabled={busy || !draft.trim() || agent.status !== "active"} aria-label="Send">
                <Send />
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
