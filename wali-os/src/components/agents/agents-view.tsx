"use client";

import * as React from "react";
import { Bot, Info, MoreHorizontal, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { AgentStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_SCOPES, type Agent, type AgentScope } from "@/lib/data/types";
import { relativeTime } from "@/lib/format";
import { newId, nowIso, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function AgentFormDialog({ open, onOpenChange, agent }: { open: boolean; onOpenChange: (o: boolean) => void; agent?: Agent }) {
  const { add, update } = useStore();
  const init = React.useCallback(
    () => ({
      name: agent?.name ?? "",
      role: agent?.role ?? "",
      instructions: agent?.instructions ?? "",
      scopes: agent?.scopes ?? (["Email"] as AgentScope[]),
      requiresApproval: agent?.requiresApproval ?? true,
    }),
    [agent]
  );
  const [form, setForm] = React.useState(init);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    if (open) setForm(init());
  }, [open, init]);

  const toggleScope = (s: AgentScope, on: boolean) =>
    setForm((f) => ({ ...f, scopes: on ? [...f.scopes, s] : f.scopes.filter((x) => x !== s) }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data = { ...form, name: form.name.trim(), role: form.role.trim() };
    if (agent) {
      update("agents", agent.id, data);
      toast.success("Agent updated");
    } else {
      add("agents", { ...data, id: newId(), status: "active", createdAt: nowIso() });
      toast.success(`${data.name} added`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={save} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{agent ? "Edit agent" : "New agent"}</DialogTitle>
            <DialogDescription>Define the role, its playbook and its guardrails.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *" htmlFor="ag-name">
              <Input id="ag-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Email Assistant" />
            </Field>
            <Field label="Role" htmlFor="ag-role">
              <Input id="ag-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Drafts replies to new leads" />
            </Field>
            <Field label="Instructions / playbook" htmlFor="ag-ins" hint="How it should work, tone of voice, what it must never do." className="sm:col-span-2">
              <Textarea id="ag-ins" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} className="min-h-32" />
            </Field>
            <div className="grid gap-2 sm:col-span-2">
              <p className="text-sm font-medium">Works on</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {AGENT_SCOPES.map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={form.scopes.includes(s)} onCheckedChange={(v) => toggleScope(s, !!v)} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
              <span>
                <span className="text-sm font-medium">Require approval</span>
                <span className="block text-xs text-muted-foreground">Everything it produces goes to Approvals before it&apos;s used.</span>
              </span>
              <Switch checked={form.requiresApproval} onCheckedChange={(v) => setForm({ ...form, requiresApproval: v })} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.name.trim()}>
              {agent ? "Save changes" : "Add agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AgentsView() {
  const { db, update, remove } = useStore();
  const agents = db.agents;
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Agent | undefined>();
  const [deleting, setDeleting] = React.useState<Agent | undefined>();

  const openForm = (a?: Agent) => {
    setEditing(a);
    setFormOpen(true);
  };

  const requestsBy = (name: string) => db.approvals.filter((a) => a.requestedBy === name);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Agents"
        description="Define each assistant role: what it does, its playbook, and whether its work needs your approval."
        actions={
          <Button size="sm" onClick={() => openForm()}>
            <Plus /> New agent
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          No AI is connected, so agents don&apos;t act on their own. Use them as role definitions and playbooks for you or a teammate to follow, and pick them as
          the requester on approval requests. When you connect an AI model later, these definitions become the agents&apos; instructions.
        </p>
      </div>

      {agents.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bot}
            title="No agents defined"
            description="Start with one role you repeat every week, such as replying to new enquiries, following up after calls, or writing the weekly client report."
            action={
              <Button onClick={() => openForm()}>
                <Plus /> Define your first agent
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => {
            const reqs = requestsBy(a.name);
            const last = reqs.map((r) => r.createdAt).sort().at(-1);
            return (
              <Card key={a.id} className="gap-4">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", a.status === "active" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>
                      <Bot className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate">{a.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">{a.role || "No role description"}</CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openForm(a)}>Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(a)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AgentStatusBadge status={a.status} />
                    {a.requiresApproval && (
                      <Badge variant="info">
                        <ShieldCheck /> Approval required
                      </Badge>
                    )}
                    {a.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="text-[11px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                  {a.instructions ? (
                    <p className="line-clamp-4 rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap text-muted-foreground">{a.instructions}</p>
                  ) : (
                    <button onClick={() => openForm(a)} className="w-full cursor-pointer rounded-md border border-dashed p-3 text-left text-xs text-muted-foreground hover:bg-muted/50">
                      + Add instructions / playbook
                    </button>
                  )}
                  <Separator />
                  <div className="space-y-3 text-sm">
                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <span>
                        <span className="font-medium">Active</span>
                        <span className="block text-xs text-muted-foreground">
                          {reqs.length} approval request{reqs.length === 1 ? "" : "s"}
                          {last ? ` · last ${relativeTime(last)}` : ""}
                        </span>
                      </span>
                      <Switch
                        checked={a.status === "active"}
                        onCheckedChange={(on) => {
                          update("agents", a.id, { status: on ? "active" : "paused" });
                          toast(on ? `${a.name} activated` : `${a.name} paused`);
                        }}
                      />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <span>
                        <span className="font-medium">Require approval</span>
                        <span className="block text-xs text-muted-foreground">Hold its output for your review</span>
                      </span>
                      <Switch checked={a.requiresApproval} onCheckedChange={(v) => update("agents", a.id, { requiresApproval: v })} />
                    </label>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AgentFormDialog open={formOpen} onOpenChange={setFormOpen} agent={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={`Delete ${deleting?.name}?`}
        onConfirm={() => {
          if (deleting) remove("agents", deleting.id);
          toast.success("Agent deleted");
        }}
      />
    </div>
  );
}
