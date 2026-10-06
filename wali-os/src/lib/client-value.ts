import type { ClientService } from "@/lib/data/types";

export interface ServiceTotals {
  /** Money received: services marked paid. */
  paid: number;
  /** Agreed, not paid yet: in progress or delivered. */
  open: number;
  /** Proposed, not agreed yet. */
  proposed: number;
  /** Projects and retainers that weren't cancelled. */
  engagements: number;
  /** Most recent non-cancelled service, by start date (else created). */
  latest?: ClientService;
}

const when = (s: ClientService) => s.startDate || s.createdAt.slice(0, 10);

/** Lifetime value and pipeline for one client's services. Safe for client and server code. */
export function serviceTotals(services: ClientService[]): ServiceTotals {
  const live = services.filter((s) => s.status !== "cancelled");
  const sum = (xs: ClientService[]) => xs.reduce((n, s) => n + (Number(s.amount) || 0), 0);
  return {
    paid: sum(live.filter((s) => s.status === "paid")),
    open: sum(live.filter((s) => s.status === "in-progress" || s.status === "delivered")),
    proposed: sum(live.filter((s) => s.status === "proposed")),
    engagements: live.filter((s) => s.status !== "proposed").length,
    latest: [...live].sort((a, b) => when(b).localeCompare(when(a)))[0],
  };
}

export const SERVICE_STATUS_LABEL: Record<ClientService["status"], string> = {
  proposed: "Proposed",
  "in-progress": "In progress",
  delivered: "Delivered",
  paid: "Paid",
  cancelled: "Cancelled",
};
