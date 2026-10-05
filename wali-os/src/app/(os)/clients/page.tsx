import { Suspense } from "react";

import { ClientsView } from "@/components/clients/clients-view";

export const metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsView />
    </Suspense>
  );
}
