"use client";

import { useStore } from "@/lib/store";

import { LoginScreen } from "./login-screen";

function Spinner() {
  return (
    <div className="grid min-h-svh place-items-center" aria-busy="true">
      <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

/** Shows sign-in when cloud sync is on, and renders the app only once data is loaded. */
export function StoreGate({ children }: { children: React.ReactNode }) {
  const { ready, auth } = useStore();
  if (auth.status === "loading") return <Spinner />;
  if (auth.status === "signed-out") return <LoginScreen />;
  if (!ready) return <Spinner />;
  return <>{children}</>;
}
