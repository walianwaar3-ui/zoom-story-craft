import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useLocation } from "react-router-dom";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/zoom-posts": "Zoom Transcripts",
  "/generate-post": "Generate Post",
  "/generated": "Generated Posts",
  "/knowledgebase": "Knowledgebase",
  "/settings": "Settings",
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const currentLabel = ROUTE_LABELS[location.pathname] ?? "Workspace";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border/70 px-5 bg-background/80 backdrop-blur-md sticky top-0 z-30">
            <SidebarTrigger className="mr-3 text-muted-foreground hover:text-foreground" />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">ZoomPost</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="font-medium text-foreground">{currentLabel}</span>
            </div>
          </header>
          <main className="flex-1 overflow-auto scrollbar-thin">
            <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 lg:py-10 animate-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
