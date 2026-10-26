import { cn } from "@/lib/utils";

export function Logo({ className, collapsed, subtitle }: { className?: string; collapsed?: boolean; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-brand-action text-white shadow-glow-sm">
        <svg viewBox="0 0 24 24" fill="none" className="size-4.5" aria-hidden="true">
          <path d="M5 6.5h14M12 6.5V18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {!collapsed && (
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-heading text-sm font-extrabold tracking-tight text-foreground">Tawakkull Growth OS</span>
          {subtitle && <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
