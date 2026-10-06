"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Send, ShieldCheck } from "lucide-react";

import { Markdown } from "@/components/shared/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Turn = {
  role: "user" | "assistant";
  content: string;
  images?: { url: string; prompt: string }[];
  approvals?: { id: string; title: string }[];
};

const STARTERS = ["Which ad is driving most of the leads?", "Show me the creative of my best ad", "Plan next week's budget for the October campaign", "Make 2 new image concepts for the winning ad"];

/** Chat with the Ads Planner agent: reads Meta data, generates images, proposes changes for approval. */
export function AdsPlannerChat() {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const history = turns.slice(-20).map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: message }]);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error("Sign in to chat with the Ads Planner.");
      const res = await fetch("/api/hermes/meta/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setTurns((t) => [...t, { role: "assistant", content: String(data.reply || "(no reply)"), images: data.images ?? [], approvals: data.approvals ?? [] }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ads Planner</CardTitle>
        <CardDescription>
          Asks Meta for live numbers, generates ad images, and proposes changes. Changes to the ad account go to Approvals first; nothing changes until
          you approve.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-[32rem] space-y-4 overflow-y-auto" aria-live="polite">
          {turns.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => void send(s)} disabled={busy}>
                  {s}
                </Button>
              ))}
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[90%] rounded-lg px-3 py-2", t.role === "user" ? "bg-primary text-sm text-primary-foreground" : "bg-muted/60")}>
                {t.role === "user" ? <p className="whitespace-pre-wrap">{t.content}</p> : <Markdown source={t.content} />}
                {t.images && t.images.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {t.images.map((img) => (
                      <a key={img.url} href={img.url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-md border bg-background">
                        {/* eslint-disable-next-line @next/next/no-img-element -- external Fal URLs, shown as-is */}
                        <img src={img.url} alt={img.prompt} title={img.prompt} loading="lazy" className="aspect-square w-full object-cover transition group-hover:opacity-90" />
                      </a>
                    ))}
                  </div>
                )}
                {t.approvals && t.approvals.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {t.approvals.map((a) => (
                      <Link
                        key={a.id}
                        href="/approvals"
                        className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
                      >
                        <ShieldCheck className="size-3.5 shrink-0 text-primary" />
                        <span className="truncate">
                          Waiting for your approval: <span className="font-medium">{a.title}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Ads Planner is working… image generation can take up to a minute.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div ref={endRef} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder="Ask about performance, plan a campaign, or request creatives…"
            className="max-h-40 min-h-10"
            maxLength={8000}
            aria-label="Message the Ads Planner"
          />
          <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send">
            <Send />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
