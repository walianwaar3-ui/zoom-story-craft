import { Suspense } from "react";

import { ApprovalsView } from "@/components/approvals/approvals-view";

export const metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <Suspense>
      <ApprovalsView />
    </Suspense>
  );
}
