"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { CommandMenu } from "./command-menu";
import { allNav, isActive } from "./nav";
import { Notifications } from "./notifications";
import { useSidebar } from "./sidebar-context";
import { SyncIndicator } from "./sync-indicator";
import { ThemeToggle } from "./theme-toggle";
import { WorldClock } from "./world-clock";

export function Topbar() {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const current = allNav.find((n) => isActive(pathname, n.href));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 lg:px-6">
      <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
        <Menu />
      </Button>

      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="hidden text-muted-foreground sm:inline">Wali OS</span>
        <span className="hidden text-muted-foreground/50 sm:inline">/</span>
        <span className="truncate font-medium">{current?.title ?? "Dashboard"}</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <SyncIndicator />
        <WorldClock />
        <Button
          variant="outline"
          className="hidden h-8 w-56 justify-start gap-2 px-2.5 text-muted-foreground md:flex"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="size-3.5" />
          <span className="text-xs">Search…</span>
          <kbd className="ml-auto rounded border bg-muted px-1.5 text-[10px] font-medium tracking-widest">⌘K</kbd>
        </Button>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSearchOpen(true)} aria-label="Search">
          <Search />
        </Button>
        <Separator orientation="vertical" className="mx-1 !h-5" />
        <Notifications />
        <ThemeToggle />
      </div>

      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
