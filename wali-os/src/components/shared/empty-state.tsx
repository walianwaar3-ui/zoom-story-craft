import type { LucideIcon } from "lucide-react";

import { Swoosh } from "@/components/shared/swoosh";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  highlight = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Gold underline on the last word. Page-level empty states only (one per screen). */
  highlight?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <span className="grid size-10 place-items-center rounded-xl bg-brand-tint text-brand-action">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-heading text-base font-bold text-foreground">
          {highlight && title.includes(" ") ? (
            <>
              {title.slice(0, title.lastIndexOf(" ") + 1)}
              <Swoosh>{title.slice(title.lastIndexOf(" ") + 1)}</Swoosh>
            </>
          ) : (
            title
          )}
        </p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
