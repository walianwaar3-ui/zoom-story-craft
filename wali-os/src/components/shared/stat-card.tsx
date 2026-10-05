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
}) {
  const positive = change !== undefined && (invert ? change < 0 : change > 0);
  const Arrow = change !== undefined && change < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <Card className="gap-3 py-4">
      <div className="flex items-start justify-between gap-2 px-4 sm:px-5">
        <span className="text-xs leading-snug text-muted-foreground sm:text-sm">{label}</span>
        <span className="hidden size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground sm:grid">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="px-4 sm:px-5">
        <p className="text-xl sm:text-2xl font-semibold tracking-tight tabular">{value}</p>
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
          footnote && <p className="mt-1 text-xs text-muted-foreground">{footnote}</p>
        )}
      </div>
    </Card>
  );
}
