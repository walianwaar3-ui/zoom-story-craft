"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, MoreHorizontal, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ClientStatusBadge, HealthBadge, clientStatusMeta } from "@/components/shared/status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Client, ClientStatus } from "@/lib/data/types";
import { relativeTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cn, formatCurrency, initials } from "@/lib/utils";

import { ClientDetail } from "./client-detail";
import { ClientFormDialog } from "./client-form";

type SortKey = "mrr" | "name" | "createdAt" | "lifetime";
const statuses = Object.keys(clientStatusMeta) as ClientStatus[];

export function ClientsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { db, transact } = useStore();
  const currency = db.settings.currency;
  const clients = db.clients;

  const selectedId = params.get("client");
  const selected = clients.find((c) => c.id === selectedId);

  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<"all" | ClientStatus>("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: -1 });
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Client | undefined>();
  const [deleting, setDeleting] = React.useState<Client | undefined>();

  // Lifetime paid per client, from their services (projects and retainers).
  const lifetime = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of db.services) if (s.status === "paid") m.set(s.clientId, (m.get(s.clientId) ?? 0) + s.amount);
    return m;
  }, [db.services]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter((c) => status === "all" || c.status === status)
      .filter((c) => !q || `${c.name} ${c.company} ${c.email} ${c.country} ${c.tags.join(" ")}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = sort.key === "lifetime" ? (lifetime.get(a.id) ?? 0) : a[sort.key];
        const bv = sort.key === "lifetime" ? (lifetime.get(b.id) ?? 0) : b[sort.key];
        return (typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv))) * sort.dir;
      });
  }, [clients, query, status, sort, lifetime]);

  const count = (s: "all" | ClientStatus) => (s === "all" ? clients.length : clients.filter((c) => c.status === s).length);
  const activeMrr = clients.filter((c) => c.status === "active" || c.status === "onboarding").reduce((s, c) => s + c.mrr, 0);
  const lifetimeTotal = [...lifetime.values()].reduce((s, v) => s + v, 0);

  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("client", id);
    else next.delete("client");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const openForm = (c?: Client) => {
    setEditing(c);
    setFormOpen(true);
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Clients"
        description={
          clients.length
            ? `${count("active")} active · ${count("lead")} leads · ${formatCurrency(activeMrr, currency)} monthly revenue · ${formatCurrency(lifetimeTotal, currency)} lifetime paid`
            : "Your leads and clients, in one place."
        }
        actions={
          <Button size="sm" onClick={() => openForm()}>
            <Plus /> Add client
          </Button>
        }
      />

      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No clients yet"
            highlight
            description="Add your first lead or client. You can track status, revenue, next action and every email and task linked to them."
            action={
              <Button onClick={() => openForm()}>
                <Plus /> Add your first client
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <TabsList className="max-w-full overflow-x-auto scrollbar-thin">
                <TabsTrigger value="all" className="flex-none">
                  All <span className="text-[11px] text-muted-foreground tabular">{count("all")}</span>
                </TabsTrigger>
                {statuses.map((s) => (
                  <TabsTrigger key={s} value={s} className="flex-none">
                    {clientStatusMeta[s].label}
                    <span className="text-[11px] text-muted-foreground tabular">{count(s)}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, tag…" className="pl-8" />
            </div>
          </div>

          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">
                    <button className="inline-flex cursor-pointer items-center gap-1 uppercase" onClick={() => toggleSort("name")}>
                      Client <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Program</TableHead>
                  <TableHead className="hidden lg:table-cell">Country</TableHead>
                  <TableHead className="text-right">
                    <button className="inline-flex cursor-pointer items-center gap-1 uppercase" onClick={() => toggleSort("mrr")}>
                      Monthly <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    <button className="inline-flex cursor-pointer items-center gap-1 uppercase" onClick={() => toggleSort("lifetime")}>
                      Lifetime <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="hidden xl:table-cell">Next action</TableHead>
                  <TableHead className="w-10 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-14 text-center text-sm text-muted-foreground">
                      No clients match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" data-state={c.id === selectedId ? "selected" : undefined} onClick={() => setSelected(c.id)}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback>{initials(c.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.company || c.email || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ClientStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{c.program || "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{c.country || "—"}</TableCell>
                    <TableCell className={cn("text-right font-medium tabular", c.mrr === 0 && "text-muted-foreground")}>
                      {formatCurrency(c.mrr, currency)}
                    </TableCell>
                    <TableCell className={cn("hidden text-right tabular sm:table-cell", !lifetime.get(c.id) && "text-muted-foreground")}>
                      {formatCurrency(lifetime.get(c.id) ?? 0, currency)}
                    </TableCell>
                    <TableCell>
                      <HealthBadge health={c.health} />
                    </TableCell>
                    <TableCell className="hidden max-w-64 xl:table-cell">
                      <p className="truncate text-sm">{c.nextAction || <span className="text-muted-foreground">—</span>}</p>
                      {c.lastContact && <p className="text-xs text-muted-foreground">Last contact {relativeTime(c.lastContact)}</p>}
                    </TableCell>
                    <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelected(c.id)}>Open profile</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openForm(c)}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(c)}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="p-0 sm:max-w-xl">
          {selected && <ClientDetail client={selected} onEdit={() => openForm(selected)} onDelete={() => setDeleting(selected)} />}
        </SheetContent>
      </Sheet>

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={`Delete ${deleting?.name}?`}
        description="This removes the client record and its services. Linked emails, tasks and meetings are kept."
        onConfirm={() => {
          if (!deleting) return;
          // Their services go too (as in the database); emails, tasks and meetings are kept.
          const gone = deleting.id;
          transact((d) => ({ ...d, clients: d.clients.filter((c) => c.id !== gone), services: d.services.filter((s) => s.clientId !== gone) }));
          if (deleting.id === selectedId) setSelected(null);
          toast.success("Client deleted");
        }}
      />
    </div>
  );
}
