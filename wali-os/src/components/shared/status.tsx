import { Badge } from "@/components/ui/badge";
import type {
  AgentStatus,
  ApprovalStatus,
  CampaignStatus,
  ClientHealth,
  ClientStatus,
  Priority,
  ThreadStatus,
} from "@/lib/data/types";
import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "destructive" | "info" | "muted" | "outline";

function Dot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 rounded-full bg-current", className)} aria-hidden />;
}

export const clientStatusMeta: Record<ClientStatus, { label: string; variant: Variant }> = {
  lead: { label: "Lead", variant: "outline" },
  onboarding: { label: "Onboarding", variant: "info" },
  active: { label: "Active", variant: "success" },
  paused: { label: "Paused", variant: "muted" },
  churned: { label: "Churned", variant: "destructive" },
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const s = clientStatusMeta[status];
  return (
    <Badge variant={s.variant}>
      <Dot /> {s.label}
    </Badge>
  );
}

export const healthMeta: Record<ClientHealth, { label: string; className: string }> = {
  good: { label: "Good", className: "bg-success" },
  watch: { label: "Watch", className: "bg-warning" },
  "at-risk": { label: "At risk", className: "bg-destructive" },
};

export function HealthBadge({ health }: { health: ClientHealth }) {
  const h = healthMeta[health];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={cn("size-2 rounded-full", h.className)} aria-hidden />
      {h.label}
    </span>
  );
}

export const campaignStatusMeta: Record<CampaignStatus, { label: string; variant: Variant }> = {
  planned: { label: "Planned", variant: "info" },
  live: { label: "Live", variant: "success" },
  paused: { label: "Paused", variant: "warning" },
  completed: { label: "Completed", variant: "outline" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = campaignStatusMeta[status];
  return (
    <Badge variant={s.variant}>
      <Dot className={status === "live" ? "animate-pulse" : undefined} /> {s.label}
    </Badge>
  );
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return status === "active" ? (
    <Badge variant="success">
      <Dot /> Active
    </Badge>
  ) : (
    <Badge variant="warning">
      <Dot /> Paused
    </Badge>
  );
}

const approvalMap: Record<ApprovalStatus, { label: string; variant: Variant }> = {
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const s = approvalMap[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export const threadStatusMeta: Record<ThreadStatus, { label: string; variant: Variant }> = {
  "needs-reply": { label: "Needs reply", variant: "warning" },
  "awaiting-approval": { label: "Awaiting approval", variant: "info" },
  "ready-to-send": { label: "Approved · send", variant: "success" },
  replied: { label: "Replied", variant: "muted" },
  closed: { label: "Closed", variant: "outline" },
};

export function ThreadStatusBadge({ status, className }: { status: ThreadStatus; className?: string }) {
  const s = threadStatusMeta[status];
  return (
    <Badge variant={s.variant} className={className}>
      {s.label}
    </Badge>
  );
}

const priorityMap: Record<Priority, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "text-destructive" },
  high: { label: "High", className: "text-warning" },
  medium: { label: "Medium", className: "text-primary" },
  low: { label: "Low", className: "text-muted-foreground" },
};

export function PriorityLabel({ priority }: { priority: Priority }) {
  const p = priorityMap[priority];
  const bars = { urgent: 4, high: 3, medium: 2, low: 1 }[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", p.className)}>
      <span className="flex items-end gap-px" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("w-[3px] rounded-[1px] bg-current", i > bars && "opacity-20")} style={{ height: 3 + i * 2 }} />
        ))}
      </span>
      {p.label}
    </span>
  );
}
