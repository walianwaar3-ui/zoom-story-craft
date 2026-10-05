export type ClientStatus = "lead" | "onboarding" | "active" | "paused" | "churned";
export type ClientHealth = "good" | "watch" | "at-risk";

export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  status: ClientStatus;
  health: ClientHealth;
  program: string;
  mrr: number;
  owner: string;
  nextAction: string;
  notes: string;
  tags: string[];
  createdAt: string;
  lastContact?: string;
}

export interface EmailMessage {
  id: string;
  direction: "in" | "out";
  body: string;
  at: string;
}

export type ThreadStatus = "needs-reply" | "awaiting-approval" | "ready-to-send" | "replied" | "closed";

export interface EmailThread {
  id: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  clientId?: string;
  status: ThreadStatus;
  messages: EmailMessage[];
  draft: string;
  /** Approval that holds the reply currently in review or approved. */
  approvalId?: string;
  updatedAt: string;
}

export type CampaignStatus = "planned" | "live" | "paused" | "completed";
export const CHANNELS = ["Email", "LinkedIn", "Meta Ads", "Google Ads", "Referral", "Event", "Content", "Other"] as const;
export type Channel = (typeof CHANNELS)[number];

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
  notes: string;
  createdAt: string;
}

export type TaskStatus = "todo" | "in-progress" | "review" | "done";
export type Priority = "urgent" | "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  clientId?: string;
  due: string;
  tags: string[];
  createdAt: string;
}

export const APPROVAL_TYPES = ["Email reply", "Proposal", "Discount", "Refund", "Content", "Campaign", "Other"] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type Risk = "low" | "medium" | "high";

export interface Approval {
  id: string;
  type: ApprovalType;
  title: string;
  summary: string;
  content: string;
  requestedBy: string;
  clientId?: string;
  threadId?: string;
  value?: number;
  risk: Risk;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decisionNote?: string;
}

export type AgentStatus = "active" | "paused";
export const AGENT_SCOPES = ["Email", "Clients", "Tasks", "Campaigns", "Approvals"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export interface Agent {
  id: string;
  name: string;
  role: string;
  instructions: string;
  scopes: AgentScope[];
  status: AgentStatus;
  requiresApproval: boolean;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Clock {
  id: string;
  city: string;
  tz: string;
}

export interface Settings {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  currency: string;
  clocks: Clock[];
}

export interface Db {
  version: 1;
  settings: Settings;
  clients: Client[];
  threads: EmailThread[];
  campaigns: Campaign[];
  tasks: Task[];
  approvals: Approval[];
  agents: Agent[];
  team: TeamMember[];
}

export type CollectionKey = Exclude<keyof Db, "version" | "settings">;
export type ItemOf<K extends CollectionKey> = Db[K][number];
