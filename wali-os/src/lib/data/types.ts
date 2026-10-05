export type ClientStatus = "active" | "onboarding" | "at-risk" | "paused" | "churned";
export type Region = "UAE" | "Saudi Arabia" | "United Kingdom" | "United States" | "Canada" | "Australia" | "Pakistan" | "Germany";

export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  region: Region;
  timezone: string;
  currency: string;
  status: ClientStatus;
  program: string;
  mrr: number;
  lifetimeValue: number;
  health: number;
  owner: string;
  startedAt: string;
  lastContact: string;
  nextAction: string;
  tags: string[];
}

export type MessageDirection = "in" | "out";
export interface Message {
  id: string;
  direction: MessageDirection;
  body: string;
  at: string;
  status?: "sent" | "delivered" | "read";
  byAgent?: boolean;
}

export interface Conversation {
  id: string;
  contactName: string;
  phone: string;
  clientId?: string;
  region: Region;
  stage: "New lead" | "Qualified" | "Booked call" | "Client" | "Follow-up";
  unread: number;
  assignedTo: string;
  aiHandling: boolean;
  lastMessageAt: string;
  messages: Message[];
}

export type CampaignStatus = "live" | "scheduled" | "draft" | "paused" | "completed";
export type Channel = "Meta Ads" | "WhatsApp Broadcast" | "Email" | "LinkedIn" | "Google Ads";

export interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  status: CampaignStatus;
  objective: string;
  market: string;
  budget: number;
  spend: number;
  leads: number;
  booked: number;
  revenue: number;
  startDate: string;
  endDate: string;
}

export type TaskStatus = "todo" | "in-progress" | "review" | "done";
export type Priority = "urgent" | "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  clientId?: string;
  due: string;
  tags: string[];
}

export type ApprovalType = "WhatsApp reply" | "Ad creative" | "Proposal" | "Discount" | "Email sequence" | "Refund";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: string;
  type: ApprovalType;
  title: string;
  summary: string;
  content: string;
  requestedBy: string;
  requestedByAgent: boolean;
  clientId?: string;
  value?: number;
  risk: "low" | "medium" | "high";
  status: ApprovalStatus;
  createdAt: string;
}

export type AgentStatus = "running" | "idle" | "paused" | "error";

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: AgentStatus;
  model: string;
  channels: string[];
  runsToday: number;
  successRate: number;
  avgHandleSeconds: number;
  hoursSavedWeek: number;
  needsApproval: boolean;
  lastRun: string;
}

export interface AgentEvent {
  id: string;
  agentId: string;
  action: string;
  target: string;
  at: string;
  outcome: "success" | "escalated" | "failed";
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  region: string;
}
