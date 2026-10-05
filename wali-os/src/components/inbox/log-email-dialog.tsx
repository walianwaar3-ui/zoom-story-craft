"use client";

import * as React from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EmailThread } from "@/lib/data/types";
import { newId, nowIso, useStore } from "@/lib/store";

const NONE = "__none";

export interface LogEmailDefaults {
  name?: string;
  email?: string;
  clientId?: string;
}

export function LogEmailDialog({
  open,
  onOpenChange,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: LogEmailDefaults;
  onCreated: (id: string) => void;
}) {
  const { db, transact } = useStore();
  const [form, setForm] = React.useState({ name: "", email: "", subject: "", body: "", clientId: NONE });

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    if (open) setForm({ name: defaults?.name ?? "", email: defaults?.email ?? "", subject: "", body: "", clientId: defaults?.clientId ?? NONE });
  }, [open, defaults]);

  // Link to an existing client automatically when the address matches.
  const onEmail = (email: string) => {
    const match = db.clients.find((c) => c.email && c.email.toLowerCase() === email.trim().toLowerCase());
    setForm((f) => ({ ...f, email, clientId: match ? match.id : f.clientId, name: f.name || match?.name || "" }));
  };

  const valid = form.email.trim() && form.body.trim();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const at = nowIso();
    const clientId = form.clientId === NONE ? undefined : form.clientId;
    const thread: EmailThread = {
      id: newId(),
      contactName: form.name.trim(),
      contactEmail: form.email.trim(),
      subject: form.subject.trim(),
      clientId,
      status: "needs-reply",
      messages: [{ id: newId(), direction: "in", body: form.body.trim(), at }],
      draft: "",
      updatedAt: at,
    };
    transact((d) => ({
      ...d,
      threads: [thread, ...d.threads],
      clients: d.clients.map((c) => (c.id === clientId ? { ...c, lastContact: at } : c)),
    }));
    toast.success("Email logged");
    onCreated(thread.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={save} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Log an incoming email</DialogTitle>
            <DialogDescription>Paste an email you received so you can draft a reply and send it for approval.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From (email) *" htmlFor="e-email">
              <Input id="e-email" type="email" autoFocus value={form.email} onChange={(e) => onEmail(e.target.value)} placeholder="name@company.com" />
            </Field>
            <Field label="From (name)" htmlFor="e-name">
              <Input id="e-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Subject" htmlFor="e-subject" className="sm:col-span-2">
              <Input id="e-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Message *" htmlFor="e-body" className="sm:col-span-2">
              <Textarea id="e-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="min-h-36" placeholder="Paste the email text here" />
            </Field>
            <Field label="Linked client" className="sm:col-span-2">
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not linked</SelectItem>
                  {db.clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` · ${c.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Log email
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
