import { cn } from "@/lib/utils";

export function Logo({ className, collapsed, subtitle }: { className?: string; collapsed?: boolean; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" className="size-4.5" aria-hidden="true">
          <path d="M3.5 6l3.2 12L12 8.5 17.3 18l3.2-12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {!collapsed && (
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold tracking-tight">Wali OS</span>
          {subtitle && <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
