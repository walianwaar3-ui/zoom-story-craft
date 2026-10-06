"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Globe, Loader2, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CTA_LABELS, parseAdPreview, type AdPreview } from "@/lib/hermes/ad-launch";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { decideApproval, reopenApproval } from "@/lib/workflows";

function domainOf(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return "";
  }
}

/**
 * A new ad from the Ads Planner, shown the way it will look in the feed, with
 * Approve / Reject. Decisions go through the same store action as the
 * Approvals page, so they sync to Supabase and Hermes sees them.
 */
export function AdPreviewCard({ approvalId, ad: fromChat }: { approvalId: string; ad?: AdPreview }) {
  const { db, transact } = useStore();
  const approval = db.approvals.find((a) => a.id === approvalId);
  const ad = fromChat ?? (approval ? parseAdPreview(approval.content) : null);
  const [expanded, setExpanded] = React.useState(false);
  if (!ad) return null;

  const body = ad.primary_text.startsWith(ad.hook) ? ad.primary_text.slice(ad.hook.length).trim() : ad.primary_text;
  const status = approval?.status;

  const decide = (next: "approved" | "rejected") => {
    if (!approval) return;
    transact((d) => decideApproval(d, approval.id, next, approval.content));
    toast[next === "approved" ? "success" : "info"](next === "approved" ? "Approved. Hermes will launch it." : "Rejected. Nothing will launch.", {
      action: { label: "Undo", onClick: () => transact((d) => reopenApproval(d, approval.id)) },
    });
  };

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-xl border bg-card text-card-foreground shadow-card">
      {/* Feed-style header */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <p className="text-xs text-muted-foreground">
          Sponsored · <span className="font-medium text-foreground">New ad</span> from {ad.source_name}
        </p>
        <Badge variant={ad.status === "ACTIVE" ? "default" : "secondary"} className="shrink-0">
          {ad.status === "ACTIVE" ? "Goes live" : "Starts paused"}
        </Badge>
      </div>

      <div className="space-y-1 px-3 py-2 text-sm">
        <p className="font-semibold">{ad.hook}</p>
        {body && (
          <>
            <p className={cn("whitespace-pre-wrap text-foreground/90", !expanded && "line-clamp-3")}>{body}</p>
            {body.length > 160 && (
              <button type="button" className="text-xs font-medium text-muted-foreground hover:underline" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "See less" : "See more"}
              </button>
            )}
          </>
        )}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- Meta / Fal URLs, shown as-is */}
      <img src={ad.image_url} alt={`Ad image: ${ad.headline}`} className="aspect-square w-full bg-muted object-cover" />

      {/* Link bar: domain, headline, description, CTA */}
      <div className="flex items-center gap-3 bg-muted/60 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {domainOf(ad.link) && (
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <Globe className="size-3 shrink-0" aria-hidden />
              {domainOf(ad.link)}
            </p>
          )}
          <p className="truncate text-sm font-semibold">{ad.headline}</p>
          {ad.description && <p className="truncate text-xs text-muted-foreground">{ad.description}</p>}
        </div>
        <a
          href={ad.link}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
          title={`Opens ${ad.link}`}
        >
          {CTA_LABELS[ad.call_to_action] ?? ad.call_to_action.replace(/_/g, " ").toLowerCase()}
        </a>
      </div>

      {/* Decision */}
      <div className="border-t px-3 py-2.5">
        {!approval ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Syncing approval…
          </p>
        ) : status === "pending" ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => decide("rejected")}>
              <X /> Reject
            </Button>
            <Button size="sm" className="flex-1" onClick={() => decide("approved")}>
              <Check /> Approve
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm">
            <p className={cn("font-medium", status === "approved" ? "text-success" : "text-muted-foreground")}>
              {status === "approved" ? (approval.executedAt ? "Launched by Hermes" : "Approved. Hermes will launch it.") : "Rejected"}
            </p>
            {!approval.executedAt && (
              <Button size="sm" variant="ghost" onClick={() => transact((d) => reopenApproval(d, approval.id))}>
                <Undo2 /> Undo
              </Button>
            )}
          </div>
        )}
        <Link href="/approvals" className="mt-1.5 block text-[11px] text-muted-foreground hover:underline">
          Open in Approvals
        </Link>
      </div>
    </div>
  );
}
