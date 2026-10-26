import { cn } from "@/lib/utils";

/**
 * The Good Tree (Surah Ibrahim 14:24), drawn from the brand's logo-icon.svg.
 * Single ink: deep green on Paper (light theme), gold on Deep green (dark theme).
 */
export function GoodTree({ className }: { className?: string }) {
  return (
    <svg viewBox="4 6 56 48" className={cn("text-brand-deep dark:text-brand-action", className)} role="img" aria-label="Tawakkul Growth">
      <path d="M6 50 C17 43 25 46.5 32 48 C39 46.5 47 43 58 50" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <path
        d="M32 48.5 C31.6 42 31.6 36 32 31 M32 38 C29 34.5 25 32 20 30.5 M32 36 C35 33 39 31.5 44 30.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M9 29.5 C7 25 9.5 21 14 20.5 C15 15.5 20 13 24.5 14.5 C27 10.5 37 10.5 39.5 14.5 C44 13 49 15.5 50 20.5 C54.5 21 57 25 55 29.5 C53.8 31.8 51.5 32.6 49 31.8 C44.5 30.4 39 29.4 32 29.4 C25 29.4 19.5 30.4 15 31.8 C12.5 32.6 10.2 31.8 9 29.5 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Logo({ className, collapsed, subtitle }: { className?: string; collapsed?: boolean; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <GoodTree className="h-7 w-auto shrink-0" />
      {!collapsed && (
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-heading text-[15px] font-bold text-foreground">Tawakkul Growth OS</span>
          {subtitle && <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
