import type { Task } from "./types";

export const tasks: Task[] = [
  { id: "tk_001", title: "Move testimonials above pricing on Q4 launch page", status: "todo", priority: "high", assignee: "Sofia", clientId: "cl_001", due: "2026-10-05", tags: ["Funnel"] },
  { id: "tk_002", title: "Re-engagement call with Marcus Reed", description: "No reply for 9 days. Prep win plan + usage stats.", status: "todo", priority: "urgent", assignee: "Wali", clientId: "cl_003", due: "2026-10-05", tags: ["Retention"] },
  { id: "tk_003", title: "Finish WhatsApp Cloud API setup for Qahtani Clinics", status: "in-progress", priority: "high", assignee: "Hamza", clientId: "cl_004", due: "2026-10-06", tags: ["WhatsApp", "Onboarding"] },
  { id: "tk_004", title: "Build GHL pipeline + snapshot for Brooks Sales", status: "in-progress", priority: "medium", assignee: "Hamza", clientId: "cl_009", due: "2026-10-08", tags: ["GHL"] },
  { id: "tk_005", title: "LinkedIn content batch (12 posts) — Whitfield", status: "review", priority: "medium", assignee: "Sofia", clientId: "cl_002", due: "2026-10-06", tags: ["Content"] },
  { id: "tk_006", title: "September performance report — Northshore", status: "review", priority: "medium", assignee: "Ayesha", clientId: "cl_005", due: "2026-10-07", tags: ["Reporting"] },
  { id: "tk_007", title: "Write AI Training webinar email sequence", status: "in-progress", priority: "high", assignee: "Sofia", due: "2026-10-09", tags: ["Email", "Launch"] },
  { id: "tk_008", title: "Deploy lead qualifier agent for Raza Advisory", status: "todo", priority: "medium", assignee: "Hamza", clientId: "cl_007", due: "2026-10-10", tags: ["AI agents"] },
  { id: "tk_009", title: "Podcast pitch emails — Noura Haddad top 3", status: "todo", priority: "low", assignee: "Ayesha", clientId: "cl_010", due: "2026-10-07", tags: ["PR"] },
  { id: "tk_010", title: "Kickoff workshop: offer & ICP — Brooks Sales", status: "done", priority: "high", assignee: "Wali", clientId: "cl_009", due: "2026-10-03", tags: ["Onboarding"] },
  { id: "tk_011", title: "Refresh GCC ad creatives (fatigue > 3.2 freq)", status: "todo", priority: "high", assignee: "Sofia", due: "2026-10-06", tags: ["Ads"] },
  { id: "tk_012", title: "Webinar funnel A/B readout — Elevate Mindset", status: "done", priority: "medium", assignee: "Ayesha", clientId: "cl_006", due: "2026-10-04", tags: ["Funnel"] },
];
