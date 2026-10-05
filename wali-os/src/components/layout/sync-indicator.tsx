"use client";

import { Cloud, CloudOff, HardDrive, Loader2 } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SyncIndicator() {
  const { mode, sync } = useStore();

  const state =
    mode === "local"
      ? { icon: HardDrive, label: "This browser", tip: "Saved in this browser only. Connect Supabase to sync across devices and with Hermes.", tone: "text-muted-foreground" }
      : sync.status === "saving"
        ? { icon: Loader2, label: "Saving…", tip: "Saving changes to the cloud", tone: "text-muted-foreground", spin: true }
        : sync.status === "error"
          ? { icon: CloudOff, label: "Not saved", tip: `Couldn't save to the cloud. Retrying automatically. ${sync.error ?? ""}`, tone: "text-destructive" }
          : { icon: Cloud, label: "Synced", tip: "All changes saved to the cloud and live-synced", tone: "text-success" };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium sm:inline-flex", state.tone)} role="status">
          <state.icon className={cn("size-3.5", "spin" in state && state.spin && "animate-spin")} />
          {state.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{state.tip}</TooltipContent>
    </Tooltip>
  );
}
