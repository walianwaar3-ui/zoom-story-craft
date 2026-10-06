"use client";

import * as React from "react";
import { CheckCircle2, Clock, Loader2, Play, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Agent } from "@/lib/data/types";
import { relativeTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type RunStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export interface AgentRun {
  id: string;
  agent_id: string;
  status: RunStatus;
  instruction: string;
  requested_by: string;
  result: string;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const isOpen = (r?: AgentRun) => r?.status === "queued" || r?.status === "running";

/**
 * Latest run per agent, live. Runs are queued from the Agents page and carried
 * out by Hermes on the VPS; status changes arrive over Supabase Realtime.
 */
export function useAgentRuns(agents: Agent[]) {
  const { mode } = useStore();
  const [runs, setRuns] = React.useState<Record<string, AgentRun>>({});
  // Latest known runs, read inside the realtime callback to detect status changes.
  const latest = React.useRef<Record<string, AgentRun>>({});
  React.useEffect(() => {
    latest.current = runs;
  }, [runs]);
  // Agent names for toasts, read inside the realtime callback.
  const names = React.useRef<Record<string, string>>({});
  React.useEffect(() => {
    names.current = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  }, [agents]);

  React.useEffect(() => {
    const sb = mode === "cloud" ? getSupabase() : null;
    if (!sb) return;
    let alive = true;

    sb.from("agent_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!alive || !data) return;
        const latest: Record<string, AgentRun> = {};
        for (const r of data as AgentRun[]) latest[r.agent_id] ??= r;
        setRuns(latest);
      });

    const channel = sb
      .channel("agent-runs")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs" }, (p) => {
        if (p.eventType === "DELETE") return;
        const run = p.new as AgentRun;
        const prev = latest.current[run.agent_id];
        // Keep only the latest run per agent.
        if (prev && prev.id !== run.id && prev.created_at > run.created_at) return;
        if (prev?.id === run.id && prev.status !== run.status) {
          const name = names.current[run.agent_id] ?? "Agent";
          if (run.status === "running") toast(`${name} started working`);
          if (run.status === "done") toast.success(`${name} finished`, { description: run.result.slice(0, 160) });
          if (run.status === "failed") toast.error(`${name} couldn't finish`, { description: run.error.slice(0, 160) });
        }
        setRuns((cur) => ({ ...cur, [run.agent_id]: run }));
      })
      .subscribe();

    return () => {
      alive = false;
      void sb.removeChannel(channel);
    };
  }, [mode]);

  const queue = React.useCallback(async (agent: Agent, instruction: string) => {
    const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
    if (!token) throw new Error("Sign in to Wali OS cloud mode to run agents.");
    const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ instruction }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    const run = data.run as AgentRun;
    setRuns((cur) => ({ ...cur, [run.agent_id]: run }));
    return run;
  }, []);

  const cancel = React.useCallback(async (run: AgentRun) => {
    const sb = getSupabase();
    if (!sb) return;
    // Only a run Hermes hasn't picked up yet can be cancelled.
    const { data } = await sb
      .from("agent_runs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("status", "queued")
      .select()
      .maybeSingle();
    if (data) setRuns((cur) => ({ ...cur, [run.agent_id]: data as AgentRun }));
    else toast("Hermes already started this run");
  }, []);

  return { runs, queue, cancel };
}

const STATUS: Record<RunStatus, { label: string; icon: React.ElementType; className: string }> = {
  queued: { label: "Queued for Hermes", icon: Clock, className: "text-muted-foreground" },
  running: { label: "Running", icon: Loader2, className: "text-primary" },
  done: { label: "Done", icon: CheckCircle2, className: "text-success" },
  failed: { label: "Failed", icon: XCircle, className: "text-destructive" },
  cancelled: { label: "Cancelled", icon: XCircle, className: "text-muted-foreground" },
};

/** One-line status of an agent's latest run; click to see the details. */
export function RunStatusLine({ run, onOpen }: { run?: AgentRun; onOpen: () => void }) {
  if (!run) return null;
  const s = STATUS[run.status];
  const Icon = s.icon;
  const when = run.finished_at ?? run.started_at ?? run.created_at;
  return (
    <button onClick={onOpen} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-muted/60">
      <Icon className={cn("size-3.5 shrink-0", s.className, run.status === "running" && "animate-spin")} aria-hidden />
      <span className={cn("font-medium", s.className)}>{s.label}</span>
      <span className="truncate text-muted-foreground">
        · {relativeTime(when)}
        {run.status === "done" && run.result ? ` · ${run.result}` : ""}
      </span>
    </button>
  );
}

/** Ask for an optional instruction, then queue the run. */
export function RunDialog({
  agent,
  open,
  onOpenChange,
  onQueue,
}: {
  agent?: Agent;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onQueue: (agent: Agent, instruction: string) => Promise<unknown>;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the box each time the dialog opens
    if (open) setText("");
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    setBusy(true);
    try {
      await onQueue(agent, text.trim());
      toast.success(`${agent.name} queued`, { description: "Hermes will pick it up and report back here." });
      onOpenChange(false);
    } catch (err) {
      toast.error("Couldn't queue the run", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Run {agent?.name}</DialogTitle>
            <DialogDescription>
              Hermes does the work with its real tools and reports back on this card. Anything that reaches a client or costs money still comes to
              Approvals first.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What should it do? Leave empty for its next due task."
            className="min-h-24"
            maxLength={4000}
            autoFocus
            aria-label="Instruction"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Play />} Queue run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Full details of a run: the instruction, and Hermes's result or error. */
export function RunDetailsDialog({
  agent,
  run,
  open,
  onOpenChange,
  onCancel,
}: {
  agent?: Agent;
  run?: AgentRun;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCancel: (run: AgentRun) => void;
}) {
  if (!run) return null;
  const s = STATUS[run.status];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {agent?.name ?? "Agent"} · {s.label}
          </DialogTitle>
          <DialogDescription>
            Queued {relativeTime(run.created_at)}
            {run.requested_by ? ` by ${run.requested_by}` : ""}
            {run.started_at ? ` · started ${relativeTime(run.started_at)}` : ""}
            {run.finished_at ? ` · finished ${relativeTime(run.finished_at)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Instruction</p>
            <p className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap">{run.instruction}</p>
          </div>
          {run.result && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">What Hermes did</p>
              <p className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap">{run.result}</p>
            </div>
          )}
          {run.error && (
            <div>
              <p className="mb-1 text-xs font-medium text-destructive">Why it failed</p>
              <p className="rounded-md bg-destructive/10 p-3 whitespace-pre-wrap">{run.error}</p>
            </div>
          )}
          {isOpen(run) && (
            <p className="text-xs text-muted-foreground">
              {run.status === "queued" ? "Waiting for Hermes to pick it up." : "Hermes is working on it."} This updates live.
            </p>
          )}
        </div>
        {run.status === "queued" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onCancel(run)}>
              Cancel run
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { isOpen as isRunOpen };
