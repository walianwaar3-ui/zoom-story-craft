"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Clock, Cloud, Database, Download, HardDrive, Plus, Trash2, Upload, Users, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CollectionKey, Db } from "@/lib/data/types";
import { emptyDb, newId, normalizeDb, readLocal, useStore } from "@/lib/store";
import { initials } from "@/lib/utils";

const CURRENCIES = ["USD", "AED", "GBP", "EUR", "SAR", "PKR", "CAD", "AUD", "INR"];

function timeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? ["UTC", "Asia/Dubai", "Asia/Karachi", "Europe/London", "America/New_York", "Australia/Sydney"];
}

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function WorkspaceTab() {
  const { db, updateSettings } = useStore();
  const s = db.settings;
  const [form, setForm] = React.useState({ businessName: s.businessName, ownerName: s.ownerName, ownerEmail: s.ownerEmail, currency: s.currency });
  const dirty = form.businessName !== s.businessName || form.ownerName !== s.ownerName || form.ownerEmail !== s.ownerEmail || form.currency !== s.currency;

  const [clock, setClock] = React.useState({ city: "", tz: "" });
  const zones = React.useMemo(() => timeZones(), []);
  const addClock = (e: React.FormEvent) => {
    e.preventDefault();
    const tz = clock.tz.trim();
    if (!isTimeZone(tz)) {
      toast.error("Pick a time zone from the list, e.g. Asia/Dubai");
      return;
    }
    const city = clock.city.trim() || tz.split("/").at(-1)!.replace(/_/g, " ");
    updateSettings({ clocks: [...s.clocks, { id: newId(), city, tz }] });
    setClock({ city: "", tz: "" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Your name is used as the default owner and approver.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Business name" htmlFor="s-biz">
            <Input id="s-biz" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </Field>
          <Field label="Reporting currency">
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Your name" htmlFor="s-name">
            <Input id="s-name" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
          </Field>
          <Field label="Your email" htmlFor="s-email">
            <Input id="s-email" type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
          </Field>
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t">
          <Button
            variant="outline"
            disabled={!dirty}
            onClick={() => setForm({ businessName: s.businessName, ownerName: s.ownerName, ownerEmail: s.ownerEmail, currency: s.currency })}
          >
            Discard
          </Button>
          <Button
            disabled={!dirty}
            onClick={() => {
              updateSettings({ ...form, businessName: form.businessName.trim(), ownerName: form.ownerName.trim(), ownerEmail: form.ownerEmail.trim() });
              toast.success("Workspace saved");
            }}
          >
            Save changes
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4" /> Client time zones
          </CardTitle>
          <CardDescription>Shown as live clocks in the top bar, with a green dot during working hours (9:00–18:00).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {s.clocks.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {s.clocks.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{c.city}</span> <span className="text-muted-foreground">· {c.tz}</span>
                  </span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.city}`} onClick={() => updateSettings({ clocks: s.clocks.filter((x) => x.id !== c.id) })}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addClock} className="flex flex-col gap-2 sm:flex-row">
            <Input list="tz-list" value={clock.tz} onChange={(e) => setClock({ ...clock, tz: e.target.value })} placeholder="Time zone, e.g. Europe/London" className="sm:flex-1" />
            <datalist id="tz-list">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <Input value={clock.city} onChange={(e) => setClock({ ...clock, city: e.target.value })} placeholder="Label (optional)" className="sm:w-44" />
            <Button type="submit" variant="outline" disabled={!clock.tz.trim()}>
              <Plus /> Add
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamTab() {
  const { db, add, remove } = useStore();
  const [form, setForm] = React.useState({ name: "", email: "", role: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    add("team", { id: newId(), name: form.name.trim(), email: form.email.trim(), role: form.role.trim() });
    setForm({ name: "", email: "", role: "" });
    toast.success("Teammate added");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>People you can assign clients and tasks to. This is a list for your own records; they don&apos;t get a login.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="divide-y rounded-lg border">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary/15 text-primary">{initials(db.settings.ownerName || "Me")}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{db.settings.ownerName || "You"}</p>
              <p className="truncate text-xs text-muted-foreground">{db.settings.ownerEmail || "Set your name and email in Workspace"}</p>
            </div>
            <span className="text-xs text-muted-foreground">Owner</span>
          </div>
          {db.team.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-3">
              <Avatar className="size-9">
                <AvatarFallback>{initials(m.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[m.role, m.email].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} onClick={() => remove("team", m.id)}>
                <Trash2 className="text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name *" aria-label="Name" />
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" aria-label="Email" />
          <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Role" aria-label="Role" />
          <Button type="submit" variant="outline" disabled={!form.name.trim()}>
            <Plus /> Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const COLLECTIONS: CollectionKey[] = ["clients", "threads", "tasks", "approvals", "campaigns", "agents", "team"];

/** Adds records from `extra` that `base` doesn't have yet (matched by id). */
function mergeDb(base: Db, extra: Db): Db {
  const next = { ...base } as Db;
  for (const k of COLLECTIONS) {
    const have = new Set((base[k] as { id: string }[]).map((x) => x.id));
    (next as unknown as Record<string, unknown>)[k] = [...(extra[k] as { id: string }[]).filter((x) => !have.has(x.id)), ...(base[k] as { id: string }[])];
  }
  if (!base.settings.ownerName && !base.settings.businessName) next.settings = extra.settings;
  return next;
}

function CopyLocalToCloud() {
  const { db, transact } = useStore();
  const [local] = React.useState(readLocal);
  const missing = COLLECTIONS.reduce(
    (n, k) => n + (local[k] as { id: string }[]).filter((x) => !(db[k] as { id: string }[]).some((y) => y.id === x.id)).length,
    0
  );
  if (missing === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="size-4" /> Data from before cloud sync
        </CardTitle>
        <CardDescription>
          This browser still holds {missing} record{missing === 1 ? "" : "s"} you entered before Supabase was connected. Copy them into the cloud workspace so
          they sync everywhere and Hermes can see them.
        </CardDescription>
      </CardHeader>
      <CardFooter className="border-t">
        <Button
          onClick={() => {
            transact((d) => mergeDb(d, local));
            toast.success(`Copied ${missing} record${missing === 1 ? "" : "s"} to the cloud`);
          }}
        >
          <Upload /> Copy to cloud
        </Button>
      </CardFooter>
    </Card>
  );
}

function DataTab() {
  const { db, replaceAll, mode, auth } = useStore();
  const cloud = mode === "cloud";
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const counts = [
    ["Clients", db.clients.length],
    ["Emails", db.threads.length],
    ["Tasks", db.tasks.length],
    ["Approvals", db.approvals.length],
    ["Campaigns", db.campaigns.length],
    ["Agents", db.agents.length],
  ] as const;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wali-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !("settings" in parsed)) throw new Error("not a backup");
      replaceAll(normalizeDb(parsed));
      toast.success("Backup restored");
    } catch {
      toast.error("That file isn't a Wali OS backup");
    }
  };

  return (
    <div className="space-y-6">
      {cloud && <CopyLocalToCloud />}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {cloud ? <Cloud className="size-4 text-success" /> : <HardDrive className="size-4" />}
            {cloud ? "Cloud workspace (Supabase)" : "Saved in this browser"}
          </CardTitle>
          <CardDescription>
            {cloud
              ? `Signed in as ${auth.email ?? "—"}. Everything is stored in your Supabase database, synced live across your devices and with Hermes. Backups are still a good habit.`
              : "Everything is saved in this browser on this device. Other people who open your link see an empty workspace of their own. Download a backup regularly, and use it to move your data to another browser or computer. Connect Supabase to sync across devices and with Hermes."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {counts.map(([label, n]) => (
              <div key={label} className="rounded-lg border p-3 text-center">
                <p className="text-lg font-semibold tabular">{n}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-2 border-t">
          <Button onClick={exportData}>
            <Download /> Download backup
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Restore from backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importData(f);
              e.target.value = "";
            }}
          />
        </CardFooter>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Erase everything</CardTitle>
          <CardDescription>
            Deletes all clients, emails, tasks, approvals, campaigns, agents and settings {cloud ? "from the cloud database, for everyone including Hermes" : "from this browser"}.
            Download a backup first.
          </CardDescription>
        </CardHeader>
        <CardFooter className="border-t">
          <Button variant="destructive" onClick={() => setResetOpen(true)}>
            <Trash2 /> Erase all data
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={cloud ? "Erase the entire cloud workspace?" : "Erase all Wali OS data in this browser?"}
        description="This can't be undone unless you have a backup file."
        confirmLabel="Erase everything"
        onConfirm={() => {
          replaceAll(emptyDb());
          toast.success("All data erased");
        }}
      />
    </div>
  );
}

export function SettingsView() {
  const params = useSearchParams();
  const initial = params.get("tab");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" description="Workspace, team and your data." />
      <Tabs defaultValue={initial === "team" || initial === "data" ? initial : "workspace"} className="gap-6">
        <TabsList>
          <TabsTrigger value="workspace">
            <Building2 /> Workspace
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users /> Team
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database /> Data & backup
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workspace">
          <WorkspaceTab />
        </TabsContent>
        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="data">
          <DataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
