"use client";

import Link from "next/link";
import { AlertTriangle, Bell, CheckCheck, MessageCircle, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const items = [
  { icon: AlertTriangle, tone: "text-destructive", title: "Ops Reporter failed", body: "Meta Ads token expired", href: "/agents", time: "4h" },
  { icon: CheckCheck, tone: "text-primary", title: "Discount approval requested", body: "5 mastermind seats — Omar", href: "/approvals", time: "15m" },
  { icon: MessageCircle, tone: "text-whatsapp", title: "Zainab Ahmed asked about pricing", body: "Concierge drafted a reply", href: "/inbox", time: "1h" },
  { icon: TrendingDown, tone: "text-warning", title: "Marcus Reed health dropped to 48", body: "No reply in 9 days", href: "/clients", time: "1d" },
];

export function Notifications() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive ring-2 ring-background" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          <span className="text-xs font-normal text-muted-foreground">{items.length} new</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((n) => (
          <DropdownMenuItem key={n.title} asChild className="items-start gap-3 py-2">
            <Link href={n.href}>
              <n.icon className={`mt-0.5 ${n.tone}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="truncate text-xs text-muted-foreground">{n.body}</p>
              </div>
              <span className="text-[11px] text-muted-foreground">{n.time}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
