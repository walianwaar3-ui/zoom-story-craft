import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-svh place-items-center p-6 text-center">
      <div className="space-y-3">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">This page isn&apos;t part of the OS</h1>
        <p className="text-sm text-muted-foreground">The link may be outdated or the module isn&apos;t built yet.</p>
        <Button asChild className="mt-2">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
