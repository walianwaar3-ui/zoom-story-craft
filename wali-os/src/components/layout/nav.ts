import {
  Bot,
  CheckCheck,
  LayoutDashboard,
  ListTodo,
  Mail,
  Megaphone,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Db } from "@/lib/data/types";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Counts that need attention; highlighted ones use the primary color. */
  badge?: (db: Db) => { count: number; highlight?: boolean };
}

export const navMain: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard, description: "Business pulse at a glance" },
  { title: "Clients", href: "/clients", icon: Users, description: "Accounts, leads and revenue" },
  {
    title: "Email Inbox",
    href: "/inbox",
    icon: Mail,
    description: "Client and lead emails, replies via approval",
    badge: (db) => ({ count: db.threads.filter((t) => t.status === "needs-reply" || t.status === "ready-to-send").length, highlight: true }),
  },
  { title: "Campaigns", href: "/campaigns", icon: Megaphone, description: "Acquisition performance" },
  {
    title: "Tasks",
    href: "/tasks",
    icon: ListTodo,
    description: "Delivery across the team",
    badge: (db) => ({ count: db.tasks.filter((t) => t.status !== "done").length }),
  },
  {
    title: "Approvals",
    href: "/approvals",
    icon: CheckCheck,
    description: "Decisions waiting on you",
    badge: (db) => ({ count: db.approvals.filter((a) => a.status === "pending").length, highlight: true }),
  },
  { title: "Agents", href: "/agents", icon: Bot, description: "Roles, playbooks and guardrails" },
];

export const navFooter: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings, description: "Workspace, team, backup" },
];

export const allNav = [...navMain, ...navFooter];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
