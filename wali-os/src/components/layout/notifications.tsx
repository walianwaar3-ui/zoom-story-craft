"use client";

import Link from "next/link";
import { Bell, CheckCheck, ListTodo, Mail, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dueLabel } from "@/lib/format";
import { useStore } from "@/lib/store";

export function Notifications() {
  const { db } = useStore();
  const pending = db.approvals.filter((a) => a.status === "pending").length;
  const needsReply = db.threads.filter((t) => t.status === "needs-reply").length;
  const readyToSend = db.threads.filter((t) => t.status === "ready-to-send").length;
  const overdue = db.tasks.filter((t) => t.status !== "done" && dueLabel(t.due).tone === "overdue").length;

  const items = [
    { show: pending > 0, icon: CheckCheck, tone: "text-primary", title: `${pending} approval${pending === 1 ? "" : "s"} waiting`, href: "/approvals" },
    { show: readyToSend > 0, icon: Send, tone: "text-success", title: `${readyToSend} approved repl${readyToSend === 1 ? "y" : "ies"} ready to send`, href: "/inbox" },
    { show: needsReply > 0, icon: Mail, tone: "text-warning", title: `${needsReply} email${needsReply === 1 ? "" : "s"} need a reply`, href: "/inbox" },
    { show: overdue > 0, icon: ListTodo, tone: "text-destructive", title: `${overdue} overdue task${overdue === 1 ? "" : "s"}`, href: "/tasks" },
  ].filter((i) => i.show);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          {items.length > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive ring-2 ring-background" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Needs your attention</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          items.map((n) => (
            <DropdownMenuItem key={n.title} asChild className="gap-3 py-2">
              <Link href={n.href}>
                <n.icon className={n.tone} />
                <span className="text-sm">{n.title}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
