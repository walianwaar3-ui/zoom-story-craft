"use client";

import * as React from "react";
import { ChevronDown, ExternalLink, FileText, Loader2, Plus, Video } from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/shared/markdown";
import { Field } from "@/components/shared/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Client, ClientMeeting } from "@/lib/data/types";
import { formatDate, relativeTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;
// Everything but the transcript: that can be long, so it loads on demand.
const LIST_COLUMNS = "id, client_id, title, occurred_at, source, url, attendees, summary, decisions, action_items, risks";

const fromRow = (r: Row): ClientMeeting => ({
  id: String(r.id),
  clientId: (r.client_id as string) ?? undefined,
  title: String(r.title ?? ""),
  occurredAt: String(r.occurred_at ?? ""),
  source: String(r.source ?? "manual"),
  url: String(r.url ?? ""),
  attendees: Array.isArray(r.attendees) ? (r.attendees as string[]) : [],
  summary: String(r.summary ?? ""),
  decisions: String(r.decisions ?? ""),
  actionItems: String(r.action_items ?? ""),
  risks: String(r.risks ?? ""),
});

function Section({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <div className="text-sm">
        <Markdown source={text} />
      </div>
    </div>
  );
}

function MeetingItem({ meeting }: { meeting: ClientMeeting }) {
  const [open, setOpen] = React.useState(false);
  const [transcript, setTranscript] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const loadTranscript = async () => {
    setLoading(true);
    const res = await getSupabase()?.from("client_meetings").select("transcript").eq("id", meeting.id).single();
    setLoading(false);
    if (res?.error) return toast.error(`Couldn't load the transcript: ${res.error.message}`);
    setTranscript(String(res?.data?.transcript ?? "") || "(No transcript saved for this meeting.)");
  };

  return (
    <li className="rounded-md border">
      <button type="button" className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Video className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{meeting.title || "Meeting"}</p>
          <p className="text-xs text-muted-foreground" title={new Date(meeting.occurredAt).toLocaleString()}>
            {formatDate(meeting.occurredAt, { month: "short", day: "numeric", year: "numeric" })} · {relativeTime(meeting.occurredAt)}
          </p>
          {!open && meeting.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{meeting.summary}</p>}
        </div>
        <Badge variant="muted" className="shrink-0 capitalize">
          {meeting.source}
        </Badge>
        <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          <Section label="Summary" text={meeting.summary} />
          <Section label="Decisions" text={meeting.decisions} />
          <Section label="Action items" text={meeting.actionItems} />
          <Section label="Risks" text={meeting.risks} />
          {meeting.attendees.length > 0 && <p className="text-xs text-muted-foreground">With {meeting.attendees.join(", ")}</p>}
          <div className="flex flex-wrap gap-2">
            {transcript === null ? (
              <Button size="sm" variant="outline" onClick={() => void loadTranscript()} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : <FileText />} Show transcript
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setTranscript(null)}>
                <FileText /> Hide transcript
              </Button>
            )}
            {/^https:\/\//.test(meeting.url) && (
              <Button size="sm" variant="ghost" asChild>
                <a href={meeting.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Recording
                </a>
              </Button>
            )}
          </div>
          {transcript !== null && (
            <pre className="max-h-80 overflow-y-auto rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap scrollbar-thin">{transcript}</pre>
          )}
        </div>
      )}
    </li>
  );
}

function AddMeetingDialog({ open, onOpenChange, client, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; client: Client; onAdded: () => void }) {
  const empty = () => ({ title: "", date: new Date().toISOString().slice(0, 10), summary: "", decisions: "", actionItems: "" });
  const [form, setForm] = React.useState(empty);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    if (open) setForm(empty());
  }, [open]);
  const set = (k: keyof ReturnType<typeof empty>, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const res = await getSupabase()
      ?.from("client_meetings")
      .insert({
        client_id: client.id,
        title: form.title.trim(),
        occurred_at: new Date(`${form.date}T12:00:00`).toISOString(),
        source: "manual",
        summary: form.summary,
        decisions: form.decisions,
        action_items: form.actionItems,
      });
    setSaving(false);
    if (res?.error) return toast.error(`Couldn't save: ${res.error.message}`);
    toast.success("Meeting added");
    onOpenChange(false);
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Add meeting note</DialogTitle>
            <DialogDescription>Fathom meetings arrive here automatically through Hermes. Use this for calls it didn&rsquo;t record.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title *" htmlFor="m-title">
              <Input id="m-title" autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Strategy call" />
            </Field>
            <Field label="Date" htmlFor="m-date">
              <Input id="m-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label="Summary" htmlFor="m-summary" className="sm:col-span-2">
              <Textarea id="m-summary" value={form.summary} onChange={(e) => set("summary", e.target.value)} className="min-h-20" />
            </Field>
            <Field label="Decisions" htmlFor="m-decisions" className="sm:col-span-2">
              <Textarea id="m-decisions" value={form.decisions} onChange={(e) => set("decisions", e.target.value)} className="min-h-14" />
            </Field>
            <Field label="Action items" htmlFor="m-actions" className="sm:col-span-2">
              <Textarea id="m-actions" value={form.actionItems} onChange={(e) => set("actionItems", e.target.value)} className="min-h-14" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.title.trim() || saving}>
              {saving && <Loader2 className="animate-spin" />} Add meeting
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Meetings in a client's file, newest first: Fathom summaries from Hermes plus manual notes. */
export function ClientMeetings({ client }: { client: Client }) {
  const { mode } = useStore();
  const [meetings, setMeetings] = React.useState<ClientMeeting[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const res = await sb.from("client_meetings").select(LIST_COLUMNS).eq("client_id", client.id).order("occurred_at", { ascending: false }).limit(100);
    if (res.error) setError(res.error.message);
    else {
      setError(null);
      setMeetings((res.data as Row[]).map(fromRow));
    }
  }, [client.id]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open; state is set after the request resolves
    void load();
  }, [load]);

  if (mode !== "cloud") return <p className="text-sm text-muted-foreground">Meetings need cloud sync (Supabase) so Hermes can save them.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {meetings === null ? "Loading…" : meetings.length === 0 ? "No meetings yet." : `${meetings.length} meeting${meetings.length === 1 ? "" : "s"}`}
        </p>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus /> Add note
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {meetings && meetings.length > 0 && (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <MeetingItem key={m.id} meeting={m} />
          ))}
        </ul>
      )}
      <AddMeetingDialog open={adding} onOpenChange={setAdding} client={client} onAdded={() => void load()} />
    </div>
  );
}
