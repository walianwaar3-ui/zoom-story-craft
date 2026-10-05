"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Download, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ClientStatusBadge, HealthMeter, regionFlag } from "@/components/shared/status";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clients, type ClientStatus } from "@/lib/data";
import { relativeTime } from "@/lib/format";
import { cn, formatCurrency, initials } from "@/lib/utils";

import { ClientDetail } from "./client-detail";

type SortKey = "mrr" | "health" | "name";
const statusTabs: { value: "all" | ClientStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "at-risk", label: "At risk" },
  { value: "paused", label: "Paused" },
  { value: "churned", label: "Churned" },
];

export function ClientsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("client");
  const selected = clients.find((c) => c.id === selectedId);

  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<"all" | ClientStatus>("all");
  const [region, setRegion] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "mrr", dir: -1 });

  const regions = React.useMemo(() => Array.from(new Set(clients.map((c) => c.region))).sort(), []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter((c) => status === "all" || c.status === status)
      .filter((c) => region === "all" || c.region === region)
      .filter((c) => !q || `${c.name} ${c.company} ${c.email} ${c.tags.join(" ")}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        return (typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number)) * sort.dir;
      });
  }, [query, status, region, sort]);

  const counts = React.useMemo(() => {
    const m: Record<string, number> = { all: clients.length };
    clients.forEach((c) => (m[c.status] = (m[c.status] ?? 0) + 1));
    return m;
  }, []);

  const totalMrr = filtered.reduce((s, c) => s + c.mrr, 0);
  const avgHealth = filtered.length ? Math.round(filtered.reduce((s, c) => s + c.health, 0) / filtered.length) : 0;

  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("client", id);
    else next.delete("client");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Clients"
        description={`${counts.active ?? 0} active across ${regions.length} countries · ${formatCurrency(clients.reduce((s, c) => s + c.mrr, 0))} MRR`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => toast.success("Export started", { description: "CSV will download shortly." })}>
              <Download /> Export
            </Button>
            <Button size="sm" onClick={() => toast("Client intake form", { description: "Connect your CRM in Settings to create clients." })}>
              <Plus /> Add client
            </Button>
          </>
        }
      />

      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="max-w-full overflow-x-auto scrollbar-thin">
            {statusTabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-none">
                {t.label}
                <span className="text-[11px] text-muted-foreground tabular">{counts[t.value] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex gap-2">
            <div className="relative flex-1 lg:w-72 lg:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, tag…" className="pl-8" />
            </div>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {regionFlag(r)} {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Tabs>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b px-4 py-3 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground tabular">{filtered.length}</span> clients
          </span>
          <span>
            <span className="font-medium text-foreground tabular">{formatCurrency(totalMrr)}</span> MRR
          </span>
          <span>
            Avg. health <span className="font-medium text-foreground tabular">{avgHealth}</span>
          </span>
        </div>
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
              <TableHead className="hidden lg:table-cell">Region</TableHead>
              <TableHead className="text-right">
                <button className="inline-flex cursor-pointer items-center gap-1 uppercase" onClick={() => toggleSort("mrr")}>
                  MRR <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead>
                <button className="inline-flex cursor-pointer items-center gap-1 uppercase" onClick={() => toggleSort("health")}>
                  Health <ArrowUpDown className="size-3" />
                </button>
              </TableHead>
              <TableHead className="hidden xl:table-cell">Next action</TableHead>
              <TableHead className="hidden lg:table-cell">Owner</TableHead>
              <TableHead className="w-10 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-16 text-center text-sm text-muted-foreground">
                  No clients match these filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                data-state={c.id === selectedId ? "selected" : undefined}
                onClick={() => setSelected(c.id)}
              >
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback>{initials(c.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.company}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <ClientStatusBadge status={c.status} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{c.program}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="mr-1.5">{regionFlag(c.region)}</span>
                  <span className="text-muted-foreground">{c.region}</span>
                </TableCell>
                <TableCell className={cn("text-right font-medium tabular", c.mrr === 0 && "text-muted-foreground")}>
                  {formatCurrency(c.mrr)}
                </TableCell>
                <TableCell>
                  <HealthMeter value={c.health} />
                </TableCell>
                <TableCell className="hidden max-w-64 xl:table-cell">
                  <p className="truncate text-sm">{c.nextAction}</p>
                  <p className="text-xs text-muted-foreground">Last contact {relativeTime(c.lastContact)}</p>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{c.owner}</TableCell>
                <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setSelected(c.id)}>Open profile</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.success(`Task created for ${c.name}`)}>Create task</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.success(`Report queued for ${c.company}`)}>Generate report</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => toast(`${c.name} marked at risk`)}>
                        Flag at risk
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="p-0 sm:max-w-lg">{selected && <ClientDetail client={selected} />}</SheetContent>
      </Sheet>
    </div>
  );
}
