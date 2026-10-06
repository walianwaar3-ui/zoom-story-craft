"use client";

import * as React from "react";
import { toast } from "sonner";

import { Field, num } from "@/components/shared/field";
import { clientStatusMeta, healthMeta } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Client, ClientHealth, ClientStatus } from "@/lib/data/types";
import { newId, nowIso, usePeople, useStore } from "@/lib/store";

type Form = Omit<Client, "id" | "createdAt" | "tags" | "mrr"> & { tags: string; mrr: string };

function toForm(c: Client | undefined, owner: string): Form {
  return {
    name: c?.name ?? "",
    company: c?.company ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    country: c?.country ?? "",
    status: c?.status ?? "lead",
    health: c?.health ?? "good",
    program: c?.program ?? "",
    mrr: c ? String(c.mrr) : "",
    owner: c?.owner ?? owner,
    nextAction: c?.nextAction ?? "",
    notes: c?.notes ?? "",
    tags: c?.tags.join(", ") ?? "",
    lastContact: c?.lastContact,
  };
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
  onSaved?: (id: string) => void;
}) {
  const { add, update, db } = useStore();
  const { owner, team } = usePeople();
  const [form, setForm] = React.useState<Form>(() => toForm(client, owner));

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    if (open) setForm(toForm(client, owner));
  }, [open, client, owner]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data = {
      ...form,
      name: form.name.trim(),
      email: form.email.trim(),
      mrr: num(form.mrr),
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    if (client) {
      update("clients", client.id, data);
      toast.success("Client updated");
      onSaved?.(client.id);
    } else {
      const id = newId();
      add("clients", { ...data, id, createdAt: nowIso() });
      toast.success(`${data.name} added`);
      onSaved?.(id);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={save} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{client ? "Edit client" : "Add client"}</DialogTitle>
            <DialogDescription>Only the name is required. You can fill in the rest later.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *" htmlFor="c-name">
              <Input id="c-name" autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Company" htmlFor="c-company">
              <Input id="c-company" value={form.company} onChange={(e) => set("company", e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="c-email">
              <Input id="c-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="c-phone">
              <Input id="c-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Country" htmlFor="c-country">
              <Input id="c-country" value={form.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
            <Field label="Program / offer" htmlFor="c-program">
              <Input id="c-program" value={form.program} onChange={(e) => set("program", e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v as ClientStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(clientStatusMeta) as ClientStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {clientStatusMeta[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Health">
              <Select value={form.health} onValueChange={(v) => set("health", v as ClientHealth)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(healthMeta) as ClientHealth[]).map((h) => (
                    <SelectItem key={h} value={h}>
                      {healthMeta[h].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Monthly revenue (${db.settings.currency})`} htmlFor="c-mrr" hint="Retainers only. Log one-time projects in the client's Services tab.">
              <Input id="c-mrr" type="number" min={0} inputMode="decimal" value={form.mrr} onChange={(e) => set("mrr", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Owner">
              <Select value={form.owner} onValueChange={(v) => set("owner", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...team, form.owner])].filter(Boolean).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Next action" htmlFor="c-next" className="sm:col-span-2">
              <Input id="c-next" value={form.nextAction} onChange={(e) => set("nextAction", e.target.value)} placeholder="e.g. Send proposal by Friday" />
            </Field>
            <Field label="Tags" htmlFor="c-tags" hint="Comma separated" className="sm:col-span-2">
              <Input id="c-tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="c-notes" className="sm:col-span-2">
              <Textarea id="c-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-20" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.name.trim()}>
              {client ? "Save changes" : "Add client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
