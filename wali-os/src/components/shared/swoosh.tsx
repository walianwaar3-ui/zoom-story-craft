import { cn } from "@/lib/utils";

/**
 * Gold hand-drawn underline (Systems of Change signature). Use at most once
 * per screen: the dashboard greeting or a page-level empty-state headline.
 */
export function Swoosh({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("swoosh", className)}>
      {children}
      <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M3 9 C 55 2, 140 1, 197 6"
          fill="none"
          stroke="var(--brand-highlight)"
          strokeWidth="5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
