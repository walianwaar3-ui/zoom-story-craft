"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Mail, Search, UserRound } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

import { allNav } from "./nav";

interface Item {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "Pages" | "Clients" | "Emails";
}

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { db } = useStore();
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState(0);

  const items = React.useMemo<Item[]>(
    () => [
      ...allNav.map((n) => ({ id: n.href, label: n.title, hint: n.description, href: n.href, icon: n.icon, group: "Pages" as const })),
      ...db.clients.map((c) => ({
        id: c.id,
        label: c.name,
        hint: [c.company, c.country].filter(Boolean).join(" · "),
        href: `/clients?client=${c.id}`,
        icon: UserRound,
        group: "Clients" as const,
      })),
      ...db.threads.map((t) => ({
        id: t.id,
        label: t.subject || "(no subject)",
        hint: t.contactName || t.contactEmail,
        href: `/inbox?t=${t.id}`,
        icon: Mail,
        group: "Emails" as const,
      })),
    ],
    [db.clients, db.threads]
  );

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.filter((i) => i.group === "Pages");
    return items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q)).slice(0, 15);
  }, [query, items]);

  const go = (item: Item) => {
    onOpenChange(false);
    router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[index]) {
      e.preventDefault();
      go(results[index]);
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setQuery("");
          setIndex(0);
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed top-[15vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Search Wali OS</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Jump to a page, client or email</DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              placeholder="Search pages, clients and emails…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border px-1.5 text-[10px] text-muted-foreground">ESC</kbd>
          </div>
          <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin" role="listbox">
            {results.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No results for “{query}”</p>
            )}
            {results.map((item, i) => {
              const header = item.group !== results[i - 1]?.group ? item.group : null;
              const Icon = item.icon;
              return (
                <React.Fragment key={item.id}>
                  {header && (
                    <p className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                      {header}
                    </p>
                  )}
                  <button
                    role="option"
                    aria-selected={i === index}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => go(item)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left text-sm",
                      i === index && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="font-medium">{item.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{item.hint}</span>
                    {i === index && <CornerDownLeft className="ml-auto size-3.5 text-muted-foreground" />}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
