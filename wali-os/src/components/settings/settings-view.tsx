"use client";

import * as React from "react";
import { Bell, Building2, Plug, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { team } from "@/lib/data";
import { cn, initials } from "@/lib/utils";

interface Integration {
  id: string;
  name: string;
  description: string;
  mark: string;
  color: string;
  connected: boolean;
  detail?: string;
}

const initialIntegrations: Integration[] = [
  { id: "ghl", name: "GoHighLevel", description: "CRM, pipelines, calendars and automations", mark: "HL", color: "bg-[#155eef]", connected: true, detail: "3 sub-accounts synced" },
  { id: "wa", name: "WhatsApp Business API", description: "Two-way messaging via Meta Cloud API", mark: "WA", color: "bg-[#25d366]", connected: true, detail: "+971 4 555 0100 · verified" },
  { id: "meta", name: "Meta Ads", description: "Campaign performance, leads and creatives", mark: "M", color: "bg-[#0866ff]", connected: false, detail: "Token expired 4h ago" },
  { id: "stripe", name: "Stripe", description: "Subscriptions, invoices and MRR", mark: "S", color: "bg-[#635bff]", connected: true, detail: "USD · GBP · AED" },
  { id: "gcal", name: "Google Calendar", description: "Strategy calls and client sessions", mark: "G", color: "bg-[#1a73e8]", connected: true },
  { id: "fathom", name: "Fathom", description: "Call recordings and transcripts for agents", mark: "F", color: "bg-[#7c3aed]", connected: true },
  { id: "slack", name: "Slack", description: "Team alerts and agent escalations", mark: "#", color: "bg-[#4a154b]", connected: false },
  { id: "anthropic", name: "Claude API", description: "Model provider for your agents", mark: "AI", color: "bg-[#d97757]", connected: true, detail: "Usage within budget" },
];

const notificationPrefs = [
  { id: "approvals", label: "New approval requests", description: "When an agent or teammate needs your decision", default: true },
  { id: "hot-leads", label: "Hot leads", description: "Lead Qualifier scores a lead above 80", default: true },
  { id: "at-risk", label: "At-risk clients", description: "Client health drops below 60", default: true },
  { id: "agent-errors", label: "Agent errors", description: "An agent fails or loses a connection", default: true },
  { id: "daily-brief", label: "Daily brief on WhatsApp", description: "08:00 summary of pipeline, tasks and approvals", default: false },
];

export function SettingsView() {
  const [integrations, setIntegrations] = React.useState(initialIntegrations);
  const [prefs, setPrefs] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(notificationPrefs.map((p) => [p.id, p.default]))
  );

  const toggleIntegration = (id: string) => {
    setIntegrations((xs) => xs.map((i) => (i.id === id ? { ...i, connected: !i.connected, detail: !i.connected ? "Connected just now" : undefined } : i)));
    const i = integrations.find((x) => x.id === id)!;
    toast.success(i.connected ? `${i.name} disconnected` : `${i.name} connected`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Settings" description="Workspace, integrations, team and notifications." />

      <Tabs defaultValue="workspace" className="gap-6">
        <TabsList className="max-w-full overflow-x-auto scrollbar-thin">
          <TabsTrigger value="workspace" className="flex-none">
            <Building2 /> Workspace
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex-none">
            <Plug /> Integrations
          </TabsTrigger>
          <TabsTrigger value="team" className="flex-none">
            <Users /> Team
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex-none">
            <Bell /> Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workspace">
          <Card>
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>How Wali OS presents your business and reports numbers.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="biz">Business name</Label>
                <Input id="biz" defaultValue="Wali Growth Consulting" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="domain">Custom domain</Label>
                <Input id="domain" defaultValue="os.yourdomain.com" />
              </div>
              <div className="grid gap-2">
                <Label>Home timezone</Label>
                <Select defaultValue="Asia/Dubai">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Dubai">Dubai (GMT+4)</SelectItem>
                    <SelectItem value="Asia/Karachi">Karachi (GMT+5)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT+1)</SelectItem>
                    <SelectItem value="America/New_York">New York (GMT-4)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Reporting currency</Label>
                <Select defaultValue="USD">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["USD", "AED", "GBP", "EUR", "SAR", "CAD", "AUD"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="hours">Working hours (used by agents for booking)</Label>
                <Input id="hours" defaultValue="Mon–Fri, 09:00–18:00 client local time" />
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t">
              <Button variant="outline">Cancel</Button>
              <Button onClick={() => toast.success("Workspace settings saved")}>Save changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="grid gap-4 sm:grid-cols-2">
            {integrations.map((i) => (
              <Card key={i.id} className="gap-4">
                <CardContent className="flex items-start gap-4">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold text-white", i.color)}>{i.mark}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{i.name}</p>
                      {i.connected ? (
                        <Badge variant="success" className="text-[10px]">Connected</Badge>
                      ) : i.detail ? (
                        <Badge variant="destructive" className="text-[10px]">Action needed</Badge>
                      ) : (
                        <Badge variant="muted" className="text-[10px]">Not connected</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{i.description}</p>
                    {i.detail && <p className="mt-2 text-xs text-muted-foreground">{i.detail}</p>}
                  </div>
                  <Button variant={i.connected ? "outline" : "default"} size="sm" onClick={() => toggleIntegration(i.id)}>
                    {i.connected ? "Manage" : i.detail ? "Reconnect" : "Connect"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>{team.length} members across {new Set(team.map((t) => t.region)).size} cities</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {team.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar className="size-9">
                    <AvatarFallback>{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email} · {m.region}
                    </p>
                  </div>
                  <Badge variant={m.role === "Owner" ? "info" : "outline"}>{m.role}</Badge>
                </div>
              ))}
            </CardContent>
            <CardFooter className="border-t">
              <Button variant="outline" size="sm" onClick={() => toast("Invite link copied")}>
                <Plus /> Invite teammate
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Choose what interrupts you. Everything else waits in Wali OS.</CardDescription>
            </CardHeader>
            <CardContent>
              {notificationPrefs.map((p, idx) => (
                <React.Fragment key={p.id}>
                  {idx > 0 && <Separator className="my-4" />}
                  <label className="flex cursor-pointer items-center justify-between gap-4">
                    <span>
                      <span className="text-sm font-medium">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.description}</span>
                    </span>
                    <Switch checked={prefs[p.id]} onCheckedChange={(v) => setPrefs((s) => ({ ...s, [p.id]: v }))} />
                  </label>
                </React.Fragment>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
