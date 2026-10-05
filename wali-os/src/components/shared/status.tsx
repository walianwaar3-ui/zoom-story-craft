import { Badge } from "@/components/ui/badge";
import type {
  AgentStatus,
  ApprovalStatus,
  CampaignStatus,
  ClientStatus,
  Priority,
} from "@/lib/data";
import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "destructive" | "info" | "muted" | "outline";

function Dot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 rounded-full bg-current", className)} aria-hidden />;
}

const clientMap: Record<ClientStatus, { label: string; variant: Variant }> = {
  active: { label: "Active", variant: "success" },
  onboarding: { label: "Onboarding", variant: "info" },
  "at-risk": { label: "At risk", variant: "warning" },
  paused: { label: "Paused", variant: "muted" },
  churned: { label: "Churned", variant: "destructive" },
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const s = clientMap[status];
  return (
    <Badge variant={s.variant}>
      <Dot /> {s.label}
    </Badge>
  );
}

const campaignMap: Record<CampaignStatus, { label: string; variant: Variant }> = {
  live: { label: "Live", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  draft: { label: "Draft", variant: "muted" },
  paused: { label: "Paused", variant: "warning" },
  completed: { label: "Completed", variant: "outline" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = campaignMap[status];
  return (
    <Badge variant={s.variant}>
      <Dot className={status === "live" ? "animate-pulse" : undefined} /> {s.label}
    </Badge>
  );
}

const agentMap: Record<AgentStatus, { label: string; variant: Variant }> = {
  running: { label: "Running", variant: "success" },
  idle: { label: "Idle", variant: "muted" },
  paused: { label: "Paused", variant: "warning" },
  error: { label: "Needs attention", variant: "destructive" },
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const s = agentMap[status];
  return (
    <Badge variant={s.variant}>
      <Dot className={status === "running" ? "animate-pulse" : undefined} /> {s.label}
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
          <span
            key={i}
            className={cn("w-[3px] rounded-[1px] bg-current", i > bars && "opacity-20")}
            style={{ height: 3 + i * 2 }}
          />
        ))}
      </span>
      {p.label}
    </span>
  );
}

export function HealthMeter({ value }: { value: number }) {
  const tone = value >= 75 ? "bg-success" : value >= 55 ? "bg-warning" : "bg-destructive";
  const label = value >= 75 ? "Healthy" : value >= 55 ? "Watch" : "At risk";
  return (
    <div className="flex items-center gap-2" title={`${label} (${value}/100)`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 text-xs font-medium tabular">{value}</span>
    </div>
  );
}

export function regionFlag(region: string) {
  const flags: Record<string, string> = {
    UAE: "🇦🇪",
    "Saudi Arabia": "🇸🇦",
    "United Kingdom": "🇬🇧",
    "United States": "🇺🇸",
    Canada: "🇨🇦",
    Australia: "🇦🇺",
    Pakistan: "🇵🇰",
    Germany: "🇩🇪",
  };
  return flags[region] ?? "🌍";
}
