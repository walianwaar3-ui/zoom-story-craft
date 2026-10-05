"use client";

import * as React from "react";
import {
  Bot,
  Check,
  FileText,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Percent,
  RotateCcw,
  ShieldAlert,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ApprovalStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { approvals as seed, getClient, type Approval, type ApprovalStatus, type ApprovalType } from "@/lib/data";
import { relativeTime } from "@/lib/format";
import { cn, formatCurrency } from "@/lib/utils";

const typeIcon: Record<ApprovalType, React.ComponentType<{ className?: string }>> = {
  "WhatsApp reply": MessageCircle,
  "Ad creative": ImageIcon,
  Proposal: FileText,
  Discount: Percent,
  "Email sequence": Mail,
  Refund: RotateCcw,
};

const riskStyle = {
  low: { label: "Low risk", variant: "success" as const },
  medium: { label: "Medium risk", variant: "warning" as const },
  high: { label: "High risk", variant: "destructive" as const },
};

function Detail({
  item,
  onDecide,
  onUndo,
}: {
  item: Approval;
  onDecide: (id: string, status: Exclude<ApprovalStatus, "pending">, content: string) => void;
  onUndo: (id: string) => void;
}) {
  const [content, setContent] = React.useState(item.content);
  const Icon = typeIcon[item.type];
  const client = getClient(item.clientId);
  const editable = item.status === "pending";
  const edited = content !== item.content;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 border-b p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{item.type}</p>
            <SheetTitleOrHeading>{item.title}</SheetTitleOrHeading>
          </div>
          <ApprovalStatusBadge status={item.status} />
        </div>
        <p className="text-sm text-muted-foreground">{item.summary}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant={riskStyle[item.risk].variant}>
            <ShieldAlert /> {riskStyle[item.risk].label}
          </Badge>
          <Badge variant="outline">
            {item.requestedByAgent ? <Bot /> : <UserRound />} {item.requestedBy}
          </Badge>
          {item.value !== undefined && <Badge variant="outline">{formatCurrency(item.value)}</Badge>}
          {client && <Badge variant="outline">{client.company}</Badge>}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-5 scrollbar-thin">
        <Label htmlFor={`content-${item.id}`} className="text-xs text-muted-foreground">
          {editable ? "Content — edit before approving if needed" : "Content"}
        </Label>
        {editable ? (
          <Textarea
            id={`content-${item.id}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-48 text-sm leading-relaxed"
          />
        ) : (
          <div className="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">{item.content}</div>
        )}
        {edited && <p className="text-xs text-primary">Edited — your changes will be used and fed back to the agent.</p>}
      </div>

      <div className="flex gap-2 border-t p-4">
        {editable ? (
          <>
            <Button variant="outline" className="flex-1" onClick={() => onDecide(item.id, "rejected", content)}>
              <X /> Reject
            </Button>
            <Button className="flex-1" onClick={() => onDecide(item.id, "approved", content)}>
              <Check /> {edited ? "Approve edited" : "Approve"}
            </Button>
          </>
        ) : (
          <Button variant="outline" className="flex-1" onClick={() => onUndo(item.id)}>
            <Undo2 /> Move back to pending
          </Button>
        )}
      </div>
    </div>
  );
}

// Radix Dialog requires a Title when rendered inside the mobile Sheet; desktop uses a plain heading.
const InSheet = React.createContext(false);
function SheetTitleOrHeading({ children }: { children: React.ReactNode }) {
  const inSheet = React.useContext(InSheet);
  const cls = "truncate font-semibold";
  return inSheet ? <SheetTitle className={cls}>{children}</SheetTitle> : <h2 className={cls}>{children}</h2>;
}

export function ApprovalsView() {
  const [items, setItems] = React.useState<Approval[]>(seed);
  const [tab, setTab] = React.useState<ApprovalStatus>("pending");
  const [selectedId, setSelectedId] = React.useState<string | null>(seed.find((a) => a.status === "pending")?.id ?? null);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const list = items.filter((a) => a.status === tab);
  const selected = items.find((a) => a.id === selectedId && a.status === tab) ?? list[0];
  const count = (s: ApprovalStatus) => items.filter((a) => a.status === s).length;

  const decide = (id: string, status: Exclude<ApprovalStatus, "pending">, content: string) => {
    const remaining = items.filter((a) => a.status === "pending" && a.id !== id);
    setItems((xs) => xs.map((a) => (a.id === id ? { ...a, status, content } : a)));
    setSelectedId(remaining[0]?.id ?? null);
    setMobileOpen(false);
    const item = items.find((a) => a.id === id)!;
    toast[status === "approved" ? "success" : "info"](`${status === "approved" ? "Approved" : "Rejected"}: ${item.title}`, {
      description: item.requestedByAgent ? `${item.requestedBy} will continue automatically.` : `${item.requestedBy} has been notified.`,
      action: { label: "Undo", onClick: () => undo(id) },
    });
  };

  const undo = (id: string) => {
    setItems((xs) => xs.map((a) => (a.id === id ? { ...a, status: "pending" } : a)));
    setTab("pending");
    setSelectedId(id);
  };

  const pendingValue = items.filter((a) => a.status === "pending").reduce((s, a) => s + (a.value ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Approvals"
        description={`${count("pending")} waiting · ${formatCurrency(pendingValue)} in deal value · agents pause on anything risky until you decide`}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ApprovalStatus)}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending <span className="text-[11px] text-muted-foreground tabular">{count("pending")}</span>
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved <span className="text-[11px] text-muted-foreground tabular">{count("approved")}</span>
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected <span className="text-[11px] text-muted-foreground tabular">{count("rejected")}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="gap-0 overflow-hidden py-0">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-success/12 text-success">
                <Check className="size-6" />
              </span>
              <p className="font-medium">All clear</p>
              <p className="text-sm text-muted-foreground">Nothing {tab} right now.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {list.map((a) => {
                const Icon = typeIcon[a.type];
                const isSel = selected?.id === a.id;
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => {
                        setSelectedId(a.id);
                        setMobileOpen(true);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50",
                        isSel && "lg:bg-muted/70 lg:shadow-[inset_2px_0_0_var(--primary)]"
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{a.title}</p>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.summary}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant={riskStyle[a.risk].variant} className="px-1.5 py-0 text-[10px]">
                            {riskStyle[a.risk].label}
                          </Badge>
                          <span className="flex items-center gap-1">
                            {a.requestedByAgent ? <Bot className="size-3" /> : <UserRound className="size-3" />}
                            {a.requestedBy}
                          </span>
                          <span>·</span>
                          <span>{relativeTime(a.createdAt)}</span>
                        </div>
                      </div>
                      {a.value !== undefined && <span className="text-sm font-medium tabular">{formatCurrency(a.value, "USD", true)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="hidden gap-0 overflow-hidden py-0 lg:flex lg:min-h-[560px]">
          {selected ? (
            <Detail key={selected.id + selected.status} item={selected} onDecide={decide} onUndo={undo} />
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Select an item to review</div>
          )}
        </Card>
      </div>

      <Sheet open={mobileOpen && !!selected} onOpenChange={setMobileOpen}>
        <SheetContent className="p-0 lg:hidden">
          <InSheet.Provider value={true}>
            {selected && <Detail key={selected.id + selected.status} item={selected} onDecide={decide} onUndo={undo} />}
          </InSheet.Provider>
        </SheetContent>
      </Sheet>
    </div>
  );
}
