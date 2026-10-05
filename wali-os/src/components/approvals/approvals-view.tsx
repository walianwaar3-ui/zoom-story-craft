"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  CheckCheck,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Mail,
  Megaphone,
  Percent,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ApprovalStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Approval, ApprovalStatus, ApprovalType } from "@/lib/data/types";
import { mailtoHref, relativeTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cn, formatCurrency } from "@/lib/utils";
import { decideApproval, markReplySent, reopenApproval } from "@/lib/workflows";

import { ApprovalFormDialog } from "./approval-form";

const typeIcon: Record<ApprovalType, React.ComponentType<{ className?: string }>> = {
  "Email reply": Mail,
  Proposal: FileText,
  Discount: Percent,
  Refund: RotateCcw,
  Content: FileText,
  Campaign: Megaphone,
  Other: CircleDollarSign,
};

const riskStyle = {
  low: { label: "Low risk", variant: "success" as const },
  medium: { label: "Medium risk", variant: "warning" as const },
  high: { label: "High risk", variant: "destructive" as const },
};

// Radix Dialog requires a Title inside the mobile Sheet; desktop uses a plain heading.
const InSheet = React.createContext(false);
function Heading({ children }: { children: React.ReactNode }) {
  const cls = "truncate font-semibold";
  return React.useContext(InSheet) ? <SheetTitle className={cls}>{children}</SheetTitle> : <h2 className={cls}>{children}</h2>;
}

function Detail({
  item,
  onDecide,
  onUndo,
  onDelete,
}: {
  item: Approval;
  onDecide: (id: string, status: Exclude<ApprovalStatus, "pending">, content: string, note: string) => void;
  onUndo: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { db, transact } = useStore();
  const [content, setContent] = React.useState(item.content);
  const [note, setNote] = React.useState("");
  const Icon = typeIcon[item.type];
  const client = db.clients.find((c) => c.id === item.clientId);
  const thread = item.threadId ? db.threads.find((t) => t.id === item.threadId) : undefined;
  const pending = item.status === "pending";
  const edited = content !== item.content;
  const readyToSend = item.status === "approved" && thread?.status === "ready-to-send" && thread.approvalId === item.id;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 border-b p-5 pr-12 lg:pr-5">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{item.type}</p>
            <Heading>{item.title}</Heading>
          </div>
          <ApprovalStatusBadge status={item.status} />
        </div>
        {item.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{item.type === "Email reply" ? `They wrote: “${item.summary}”` : item.summary}</p>}
        <div className="flex flex-wrap gap-2">
          <Badge variant={riskStyle[item.risk].variant}>
            <ShieldAlert /> {riskStyle[item.risk].label}
          </Badge>
          <Badge variant="outline">
            <UserRound /> {item.requestedBy}
          </Badge>
          {item.value !== undefined && <Badge variant="outline">{formatCurrency(item.value, db.settings.currency)}</Badge>}
          {client && (
            <Badge variant="outline" asChild>
              <Link href={`/clients?client=${client.id}`}>{client.name}</Link>
            </Badge>
          )}
          {thread && (
            <Badge variant="outline" asChild>
              <Link href={`/inbox?t=${thread.id}`}>
                <Mail /> View conversation
              </Link>
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
        <div className="space-y-2">
          <Label htmlFor={`content-${item.id}`} className="text-xs text-muted-foreground">
            {pending ? (item.type === "Email reply" ? "Reply text (edit before approving if needed)" : "Details (editable)") : item.type === "Email reply" ? "Reply text" : "Details"}
          </Label>
          {pending ? (
            <Textarea id={`content-${item.id}`} value={content} onChange={(e) => setContent(e.target.value)} className="min-h-48 text-sm leading-relaxed" />
          ) : (
            <div className="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">{item.content || "—"}</div>
          )}
          {edited && <p className="text-xs text-primary">Edited. Your version will be the one approved.</p>}
        </div>
        {pending ? (
          <div className="space-y-2">
            <Label htmlFor={`note-${item.id}`} className="text-xs text-muted-foreground">
              Decision note (optional)
            </Label>
            <Input id={`note-${item.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Tone down the discount wording" />
          </div>
        ) : (
          item.decisionNote && (
            <p className="text-sm">
              <span className="text-muted-foreground">Note: </span>
              {item.decisionNote}
            </p>
          )
        )}
        {readyToSend && thread && (
          <div className="space-y-3 rounded-lg border border-success/40 bg-success/8 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCheck className="size-4 text-success" /> Approved. Send it to {thread.contactEmail}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="bg-success text-white hover:bg-success/90">
                <a href={mailtoHref(thread.contactEmail, thread.subject, item.content)}>
                  <ExternalLink /> Open in email app
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  transact((d) => markReplySent(d, thread.id, item.content));
                  toast.success("Marked as sent");
                }}
              >
                <Check /> Mark as sent
              </Button>
            </div>
          </div>
        )}
        {item.executedAt && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCheck className="size-4" /> Carried out by {item.requestedBy} {relativeTime(item.executedAt)}
          </p>
        )}
        {item.status === "approved" && thread?.status === "replied" && !item.executedAt && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCheck className="size-4" /> Sent
          </p>
        )}
      </div>

      <div className="flex gap-2 border-t p-4">
        {pending ? (
          <>
            <Button variant="outline" className="flex-1" onClick={() => onDecide(item.id, "rejected", content, note)}>
              <X /> Reject
            </Button>
            <Button className="flex-1" onClick={() => onDecide(item.id, "approved", content, note)}>
              <Check /> {edited ? "Approve edited" : "Approve"}
            </Button>
          </>
        ) : (
          thread?.status !== "replied" && (
            <Button variant="outline" className="flex-1" onClick={() => onUndo(item.id)}>
              <Undo2 /> Move back to pending
            </Button>
          )
        )}
        <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} aria-label="Delete request">
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

export function ApprovalsView() {
  const params = useSearchParams();
  const { db, transact, remove } = useStore();
  const items = React.useMemo(() => [...db.approvals].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.approvals]);

  const initial = items.find((a) => a.id === params.get("id"));
  const [tab, setTab] = React.useState<ApprovalStatus>(initial?.status ?? "pending");
  const [selectedId, setSelectedId] = React.useState<string | null>(initial?.id ?? null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const list = items.filter((a) => a.status === tab);
  const selected = list.find((a) => a.id === selectedId) ?? list[0];
  const count = (s: ApprovalStatus) => items.filter((a) => a.status === s).length;
  const pendingValue = items.filter((a) => a.status === "pending").reduce((s, a) => s + (a.value ?? 0), 0);

  const undo = (id: string) => {
    transact((d) => reopenApproval(d, id));
    setTab("pending");
    setSelectedId(id);
  };

  const decide = (id: string, status: Exclude<ApprovalStatus, "pending">, content: string, note: string) => {
    const item = items.find((a) => a.id === id);
    transact((d) => decideApproval(d, id, status, content, note));
    setMobileOpen(false);
    if (status === "approved" && item?.threadId) {
      // Keep the approved reply on screen so it can be sent right away.
      setTab("approved");
      setSelectedId(id);
    } else {
      setSelectedId(items.find((a) => a.status === "pending" && a.id !== id)?.id ?? null);
    }
    toast[status === "approved" ? "success" : "info"](`${status === "approved" ? "Approved" : "Rejected"}: ${item?.title ?? ""}`, {
      description: item?.threadId ? (status === "approved" ? "Send it from here or from the inbox." : "The draft is back in the inbox for editing.") : undefined,
      action: { label: "Undo", onClick: () => undo(id) },
    });
  };

  const detail = selected ? (
    <Detail key={selected.id + selected.status} item={selected} onDecide={decide} onUndo={undo} onDelete={setDeletingId} />
  ) : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Approvals"
        description={
          items.length
            ? `${count("pending")} waiting${pendingValue ? ` · ${formatCurrency(pendingValue, db.settings.currency)} in value` : ""} · nothing goes out until you approve it`
            : "Every reply and decision that needs your sign-off lands here."
        }
        actions={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus /> New request
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ApprovalStatus)}>
        <TabsList>
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">
              {s} <span className="text-[11px] text-muted-foreground tabular">{count(s)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="gap-0 overflow-hidden py-0">
          {list.length === 0 ? (
            <EmptyState
              icon={tab === "pending" ? Check : CheckCheck}
              title={tab === "pending" ? "Nothing waiting on you" : `No ${tab} items`}
              description={
                tab === "pending"
                  ? "Email replies you submit from the inbox, and requests you create here, will appear for review."
                  : undefined
              }
            />
          ) : (
            <ul className="divide-y">
              {list.map((a) => {
                const Icon = typeIcon[a.type];
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => {
                        setSelectedId(a.id);
                        setMobileOpen(true);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50",
                        selected?.id === a.id && "lg:bg-muted/70 lg:shadow-[inset_2px_0_0_var(--primary)]"
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.content || a.summary}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant={riskStyle[a.risk].variant} className="px-1.5 py-0 text-[10px]">
                            {riskStyle[a.risk].label}
                          </Badge>
                          <span>{a.requestedBy}</span>
                          <span>·</span>
                          <span>{relativeTime(a.createdAt)}</span>
                        </div>
                      </div>
                      {a.value !== undefined && (
                        <span className="text-sm font-medium tabular">{formatCurrency(a.value, db.settings.currency, true)}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="hidden gap-0 overflow-hidden py-0 lg:flex lg:min-h-[520px]">
          {detail ?? <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Select an item to review</div>}
        </Card>
      </div>

      <Sheet open={mobileOpen && !!selected} onOpenChange={setMobileOpen}>
        <SheetContent className="p-0 lg:hidden">
          <InSheet.Provider value={true}>{detail}</InSheet.Provider>
        </SheetContent>
      </Sheet>

      <ApprovalFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(id) => {
          setTab("pending");
          setSelectedId(id);
        }}
      />

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(o) => !o && setDeletingId(null)}
        title="Delete this request?"
        description="If it's an email reply still in review, the draft goes back to the inbox."
        onConfirm={() => {
          const item = items.find((a) => a.id === deletingId);
          if (!item) return;
          const linked = item.threadId && db.threads.find((t) => t.id === item.threadId)?.approvalId === item.id;
          if (linked) {
            // Return an unsent reply to the inbox instead of leaving the thread stuck.
            transact((d) => {
              const next = decideApproval(d, item.id, "rejected", item.content);
              return { ...next, approvals: next.approvals.filter((a) => a.id !== item.id) };
            });
          } else {
            remove("approvals", item.id);
          }
          setMobileOpen(false);
          toast.success("Request deleted");
        }}
      />
    </div>
  );
}
