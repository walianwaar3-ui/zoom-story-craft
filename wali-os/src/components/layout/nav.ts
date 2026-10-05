import {
  Bot,
  CheckCheck,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  MessageCircle,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import { approvals, conversations, tasks } from "@/lib/data";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  description: string;
}

const unreadMessages = conversations.reduce((sum, c) => sum + c.unread, 0);
const pendingApprovals = approvals.filter((a) => a.status === "pending").length;
const openTasks = tasks.filter((t) => t.status !== "done").length;

export const navMain: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard, description: "Business pulse at a glance" },
  { title: "Clients", href: "/clients", icon: Users, description: "Accounts, health and revenue" },
  { title: "WhatsApp Inbox", href: "/inbox", icon: MessageCircle, badge: unreadMessages, description: "Lead and client conversations" },
  { title: "Campaigns", href: "/campaigns", icon: Megaphone, description: "Acquisition performance" },
  { title: "Tasks", href: "/tasks", icon: ListTodo, badge: openTasks, description: "Delivery across the team" },
  { title: "Approvals", href: "/approvals", icon: CheckCheck, badge: pendingApprovals, description: "Decisions waiting on you" },
  { title: "Agents", href: "/agents", icon: Bot, description: "Your AI workforce" },
];

export const navFooter: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings, description: "Workspace, integrations, team" },
];

export const allNav = [...navMain, ...navFooter];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
