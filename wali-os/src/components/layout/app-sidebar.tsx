"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, Download, LogOut, PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/lib/store";
import { cn, initials } from "@/lib/utils";

import { Logo } from "./logo";
import { isActive, navFooter, navMain, type NavItem } from "./nav";
import { useSidebar } from "./sidebar-context";

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { db } = useStore();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const badge = item.badge?.(db);

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      {active && (
        <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-brand-action" aria-hidden />
      )}
      <Icon className={cn("size-4 shrink-0", active ? "text-brand-action" : "text-muted-foreground group-hover:text-sidebar-accent-foreground")} />
      {!collapsed && <span className="truncate">{item.title}</span>}
      {!collapsed && badge?.count ? (
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-px text-[11px] font-semibold tabular",
            badge.highlight ? "bg-primary text-primary-foreground" : "bg-brand-tint text-foreground"
          )}
        >
          {badge.count}
        </span>
      ) : null}
      {collapsed && badge?.count ? (
        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand-highlight" aria-hidden />
      ) : null}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.title}
        {badge?.count ? ` · ${badge.count}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { toggle } = useSidebar();
  const { db, mode, auth, signOut } = useStore();
  const name = db.settings.ownerName || "Set up your profile";
  const email = (mode === "cloud" ? auth.email : db.settings.ownerEmail) || "Settings → Workspace";

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center border-b border-sidebar-border px-3", collapsed && "justify-center px-0")}>
        <Logo collapsed={collapsed} subtitle={db.settings.businessName || "Operating system"} />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Main">
        <div className="space-y-0.5">
          {!collapsed && (
            <p className="eyebrow px-2.5 pb-2">
              Operate
            </p>
          )}
          {navMain.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>

      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border px-3 py-3">
        {navFooter.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-md p-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                collapsed && "justify-center"
              )}
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary/15 text-[11px] text-primary">
                  {initials(db.settings.ownerName || "Wali OS")}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">{email}</p>
                  </div>
                  <ChevronsUpDown className="size-3.5 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">{db.settings.businessName || "Wali OS"}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <UserRound /> Profile & workspace
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=data">
                <Download /> Back up data
              </Link>
            </DropdownMenuItem>
            {mode === "cloud" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className={cn("hidden w-full justify-start text-muted-foreground lg:flex", collapsed && "justify-center")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && (
            <>
              Collapse
              <kbd className="ml-auto text-[10px] tracking-widest">⌘B</kbd>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-[60px]" : "w-64"
        )}
      >
        <SidebarBody collapsed={collapsed} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0" showClose={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
