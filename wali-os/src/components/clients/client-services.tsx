"use client";

import * as React from "react";
import { CheckCircle2, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field, num } from "@/components/shared/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_STATUS_LABEL, serviceTotals } from "@/lib/client-value";
import type { Client, ClientService, ServiceKind, ServiceStatus } from "@/lib/data/types";
import { formatDate } from "@/lib/format";
import { newId, nowIso, useStore } from "@/lib/store";
import { cn, formatCurrency } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_STYLE: Record<ServiceStatus, string> = {
  proposed: "bg-muted text-muted-foreground",
  "in-progress": "bg-brand-tint text-secondary-foreground",
  delivered: "bg-brand-highlight/25 text-foreground",
  paid: "bg-success-bg text-success",
  cancelled: "bg-muted text-muted-foreground line-through",
};

type Form = { name: string; kind: ServiceKind; status: ServiceStatus; amount: string; startDate: string; endDate: string; paidDate: string; notes: string };

const toForm = (s?: ClientService): Form => ({
  name: s?.name ?? "",
  kind: s?.kind ?? "one-time",
  status: s?.status ?? "in-progress",
  amount: s ? String(s.amount) : "",
  startDate: s?.startDate ?? today(),
  endDate: s?.endDate ?? "",
  paidDate: s?.paidDate ?? "",
  notes: s?.notes ?? "",
});

function ServiceDialog({ open, onOpenChange, client, service }: { open: boolean; onOpenChange: (o: boolean) => void; client: Client; service?: ClientService }) {
  const { add, update, db } = useStore();
  const [form, setForm] = React.useState<Form>(() => toForm(service));
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    if (open) setForm(toForm(service));
  }, [open, service]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    // Marking it paid without a date records today.
    const paidDate = form.status === "paid" ? form.paidDate || today() : form.paidDate;
    const data = { ...form, name: form.name.trim(), amount: num(form.amount), paidDate };
    if (service) {
      update("services", service.id, data);
      toast.success("Service updated");
    } else {
      add("services", { ...data, id: newId(), clientId: client.id, createdAt: nowIso() });
      toast.success(`${data.name} added to ${client.name}`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{service ? "Edit service" : "Add service"}</DialogTitle>
            <DialogDescription>A one-time project or a monthly retainer for {client.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service *" htmlFor="s-name" className="sm:col-span-2">
              <Input id="s-name" autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. GoHighLevel funnel build" />
            </Field>
            <Field label="Type">
              <Select value={form.kind} onValueChange={(v) => set("kind", v as ServiceKind)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-time">One-time project</SelectItem>
                  <SelectItem value="monthly">Monthly retainer</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v as ServiceStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SERVICE_STATUS_LABEL) as ServiceStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SERVICE_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`${form.kind === "monthly" ? "Monthly amount" : "Amount"} (${db.settings.currency})`} htmlFor="s-amount">
              <Input id="s-amount" type="number" min={0} inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Start" htmlFor="s-start">
              <Input id="s-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label={form.kind === "monthly" ? "Ends" : "Delivered"} htmlFor="s-end">
              <Input id="s-end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </Field>
            <Field label="Paid on" htmlFor="s-paid">
              <Input id="s-paid" type="date" value={form.paidDate} onChange={(e) => set("paidDate", e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="s-notes" className="sm:col-span-2">
              <Textarea id="s-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-16" placeholder="Scope, deliverables, invoice number…" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.name.trim()}>
              {service ? "Save changes" : "Add service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A client's projects and retainers, with lifetime value: for clients who come back project after project. */
export function ClientServices({ client }: { client: Client }) {
  const { db, update, remove } = useStore();
  const currency = db.settings.currency;
  const services = db.services
    .filter((s) => s.clientId === client.id)
    .sort((a, b) => (b.startDate || b.createdAt).localeCompare(a.startDate || a.createdAt));
  const totals = serviceTotals(services);
  const [dialog, setDialog] = React.useState<{ open: boolean; service?: ClientService }>({ open: false });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Lifetime paid</p>
          <p className="mt-1 font-semibold tabular">{formatCurrency(totals.paid, currency)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Open</p>
          <p className="mt-1 font-semibold tabular">{formatCurrency(totals.open, currency)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Proposed</p>
          <p className="mt-1 font-semibold tabular">{formatCurrency(totals.proposed, currency)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {totals.engagements === 0 ? "No projects yet." : `${totals.engagements} engagement${totals.engagements === 1 ? "" : "s"}`}
          {totals.engagements > 1 && <span className="ml-1.5 inline-flex items-center gap-1 text-foreground"><Repeat className="size-3.5" /> returning client</span>}
        </p>
        <Button size="sm" onClick={() => setDialog({ open: true })}>
          <Plus /> Add service
        </Button>
      </div>

      {services.length > 0 && (
        <ul className="space-y-2">
          {services.map((s) => (
            <li key={s.id} className="rounded-md border px-3 py-2.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", s.status === "cancelled" && "text-muted-foreground line-through")}>{s.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.kind === "monthly" ? "Monthly retainer" : "One-time"}
                    {s.startDate && ` · started ${formatDate(s.startDate, { month: "short", day: "numeric", year: "numeric" })}`}
                    {s.paidDate && ` · paid ${formatDate(s.paidDate, { month: "short", day: "numeric", year: "numeric" })}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular">
                    {formatCurrency(s.amount, currency)}
                    {s.kind === "monthly" && <span className="text-xs font-normal text-muted-foreground">/mo</span>}
                  </span>
                  <Badge className={cn("border-transparent", STATUS_STYLE[s.status])}>{SERVICE_STATUS_LABEL[s.status]}</Badge>
                </div>
              </div>
              {s.notes && <p className="mt-1.5 text-xs whitespace-pre-wrap text-muted-foreground">{s.notes}</p>}
              <div className="mt-2 flex gap-1">
                {s.status !== "paid" && s.status !== "cancelled" && s.status !== "proposed" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      update("services", s.id, { status: "paid", paidDate: s.paidDate || today() });
                      toast.success(`${s.name} marked paid`);
                    }}
                  >
                    <CheckCircle2 /> Mark paid
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDialog({ open: true, service: s })}>
                  <Pencil /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => {
                    remove("services", s.id);
                    toast.success("Service deleted");
                  }}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ServiceDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} client={client} service={dialog.service} />
    </div>
  );
}
