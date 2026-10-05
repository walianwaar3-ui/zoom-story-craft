"use client";

import * as React from "react";
import { toast } from "sonner";

import { Field, num } from "@/components/shared/field";
import { campaignStatusMeta } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CHANNELS, type Campaign, type CampaignStatus, type Channel } from "@/lib/data/types";
import { todayIso } from "@/lib/format";
import { newId, nowIso, useStore } from "@/lib/store";

const numericKeys = ["budget", "spend", "leads", "booked", "revenue"] as const;

export function CampaignFormDialog({ open, onOpenChange, campaign }: { open: boolean; onOpenChange: (open: boolean) => void; campaign?: Campaign }) {
  const { db, add, update } = useStore();
  const init = React.useCallback(
    () => ({
      name: campaign?.name ?? "",
      channel: campaign?.channel ?? ("Email" as Channel),
      status: campaign?.status ?? ("planned" as CampaignStatus),
      objective: campaign?.objective ?? "",
      market: campaign?.market ?? "",
      startDate: campaign?.startDate ?? todayIso(),
      endDate: campaign?.endDate ?? "",
      notes: campaign?.notes ?? "",
      budget: campaign ? String(campaign.budget) : "",
      spend: campaign ? String(campaign.spend) : "",
      leads: campaign ? String(campaign.leads) : "",
      booked: campaign ? String(campaign.booked) : "",
      revenue: campaign ? String(campaign.revenue) : "",
    }),
    [campaign]
  );
  const [form, setForm] = React.useState(init);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    if (open) setForm(init());
  }, [open, init]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data: Omit<Campaign, "id" | "createdAt"> = {
      ...form,
      name: form.name.trim(),
      budget: num(form.budget),
      spend: num(form.spend),
      leads: num(form.leads),
      booked: num(form.booked),
      revenue: num(form.revenue),
    };
    if (campaign) {
      update("campaigns", campaign.id, data);
      toast.success("Campaign updated");
    } else {
      add("campaigns", { ...data, id: newId(), createdAt: nowIso() });
      toast.success("Campaign added");
    }
    onOpenChange(false);
  };

  const cur = db.settings.currency;
  const labels: Record<(typeof numericKeys)[number], string> = {
    budget: `Budget (${cur})`,
    spend: `Spent so far (${cur})`,
    leads: "Leads",
    booked: "Calls booked",
    revenue: `Revenue won (${cur})`,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={save} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{campaign ? "Update campaign" : "Add campaign"}</DialogTitle>
            <DialogDescription>Track any acquisition effort. Update the numbers as results come in.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *" htmlFor="cp-name" className="sm:col-span-2">
              <Input id="cp-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Channel">
              <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as Channel })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as CampaignStatus })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(campaignStatusMeta) as CampaignStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {campaignStatusMeta[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Objective" htmlFor="cp-obj">
              <Input id="cp-obj" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="e.g. Book strategy calls" />
            </Field>
            <Field label="Market / audience" htmlFor="cp-market">
              <Input id="cp-market" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} />
            </Field>
            <Field label="Start" htmlFor="cp-start">
              <Input id="cp-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label="End" htmlFor="cp-end">
              <Input id="cp-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Field>
            {numericKeys.map((k) => (
              <Field key={k} label={labels[k]} htmlFor={`cp-${k}`}>
                <Input id={`cp-${k}`} type="number" min={0} inputMode="decimal" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder="0" />
              </Field>
            ))}
            <Field label="Notes" htmlFor="cp-notes" className="sm:col-span-2">
              <Textarea id="cp-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-16" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.name.trim()}>
              {campaign ? "Save changes" : "Add campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
