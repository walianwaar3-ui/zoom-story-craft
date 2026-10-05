import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { StoreGate } from "@/components/layout/store-gate";
import { Topbar } from "@/components/layout/topbar";
import { StoreProvider } from "@/lib/store";

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <StoreGate>
        <SidebarProvider>
          <div className="flex min-h-svh">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
            </div>
          </div>
        </SidebarProvider>
      </StoreGate>
    </StoreProvider>
  );
}
