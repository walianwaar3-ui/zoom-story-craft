"use client";

import * as React from "react";
import { toast } from "sonner";

import { Field, num } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_TYPES, type ApprovalType, type Risk } from "@/lib/data/types";
import { newId, nowIso, usePeople, useStore } from "@/lib/store";

const NONE = "__none";

export function ApprovalFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { db, add } = useStore();
  const { owner, requesters } = usePeople();
  const blank = React.useCallback(
    () => ({ type: "Proposal" as ApprovalType, title: "", summary: "", content: "", requestedBy: owner, clientId: NONE, value: "", risk: "medium" as Risk }),
    [owner]
  );
  const [form, setForm] = React.useState(blank);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    if (open) setForm(blank());
  }, [open, blank]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const id = newId();
    add("approvals", {
      id,
      type: form.type,
      title: form.title.trim(),
      summary: form.summary.trim(),
      content: form.content.trim(),
      requestedBy: form.requestedBy,
      clientId: form.clientId === NONE ? undefined : form.clientId,
      value: form.value ? num(form.value) : undefined,
      risk: form.risk,
      status: "pending",
      createdAt: nowIso(),
    });
    toast.success("Approval request created");
    onCreated(id);
    onOpenChange(false);
  };

  // Email replies are created from the Email Inbox so they stay linked to their conversation.
  const types = APPROVAL_TYPES.filter((t) => t !== "Email reply");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={save} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>New approval request</DialogTitle>
            <DialogDescription>For anything that needs a yes or no before it happens: proposals, discounts, refunds, content.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title *" htmlFor="a-title" className="sm:col-span-2">
              <Input id="a-title" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ApprovalType })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Risk">
              <Select value={form.risk} onValueChange={(v) => setForm({ ...form, risk: v as Risk })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Requested by">
              <Select value={form.requestedBy} onValueChange={(v) => setForm({ ...form, requestedBy: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {requesters.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Value (${db.settings.currency})`} htmlFor="a-value">
              <Input id="a-value" type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Client" className="sm:col-span-2">
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {db.clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Summary" htmlFor="a-summary" className="sm:col-span-2">
              <Input id="a-summary" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="One line on why this needs a decision" />
            </Field>
            <Field label="Details" htmlFor="a-content" className="sm:col-span-2">
              <Textarea id="a-content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="min-h-28" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.title.trim()}>
              Create request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
