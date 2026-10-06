import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  change,
  changeLabel = "vs last month",
  changeUnit = "%",
  icon: Icon,
  invert = false,
  footnote,
  accent = false,
}: {
  label: string;
  value: string;
  change?: number;
  changeLabel?: string;
  changeUnit?: string;
  icon: LucideIcon;
  /** When true, a negative change is good (e.g. response time). */
  invert?: boolean;
  footnote?: string;
  /** Navy highlight card. Use for at most one KPI per screen. */
  accent?: boolean;
}) {
  const positive = change !== undefined && (invert ? change < 0 : change > 0);
  const Arrow = change !== undefined && change < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <Card className={cn("gap-3 py-4", accent && "border-brand-deep-2 bg-brand-deep-2 text-white dark:border-brand-action/40 dark:bg-brand-tint")}>
      <div className="flex items-start justify-between gap-2 px-4 sm:px-5">
        <span className={cn("text-xs leading-snug font-medium sm:text-[13px]", accent ? "text-white/80" : "text-muted-foreground")}>{label}</span>
        <span className={cn("hidden size-8 shrink-0 place-items-center rounded-lg sm:grid", accent ? "bg-white/10 text-brand-highlight" : "bg-brand-tint text-brand-action")}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="px-4 sm:px-5">
        <p className={cn("font-heading text-2xl font-extrabold tracking-tight tabular sm:text-[28px]", accent ? "text-white" : "text-foreground")}>{value}</p>
        {change !== undefined ? (
          <p className="mt-1 flex items-center gap-1 text-xs">
            <span className={cn("inline-flex items-center gap-0.5 font-medium", positive ? "text-success" : "text-destructive")}>
              <Arrow className="size-3.5" />
              {Math.abs(change)}
              {changeUnit}
            </span>
            <span className="text-muted-foreground">{changeLabel}</span>
          </p>
        ) : (
          footnote && <p className={cn("mt-1 text-xs", accent ? "text-white/80" : "text-muted-foreground")}>{footnote}</p>
        )}
      </div>
    </Card>
  );
}
