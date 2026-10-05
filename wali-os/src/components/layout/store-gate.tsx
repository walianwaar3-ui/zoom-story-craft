"use client";

import { useStore } from "@/lib/store";

/** Data lives in this browser, so render the app only once it has been read. */
export function StoreGate({ children }: { children: React.ReactNode }) {
  const { ready } = useStore();
  if (!ready) {
    return (
      <div className="grid min-h-svh place-items-center" aria-busy="true">
        <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
