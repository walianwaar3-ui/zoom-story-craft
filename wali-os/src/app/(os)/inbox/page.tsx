import { Suspense } from "react";

import { InboxView } from "@/components/inbox/inbox-view";

export const metadata = { title: "WhatsApp Inbox" };

export default function InboxPage() {
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
