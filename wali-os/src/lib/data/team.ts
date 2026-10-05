import type { TeamMember } from "./types";

export const MOCK_NOW = new Date("2026-10-05T10:00:00Z");

export const currentUser = {
  name: "Wali Anwaar",
  email: "wali@walios.com",
  role: "Founder & Growth Architect",
};

export const team: TeamMember[] = [
  { id: "tm_1", name: "Wali Anwaar", email: "wali@walios.com", role: "Owner", region: "Dubai" },
  { id: "tm_2", name: "Ayesha Khan", email: "ayesha@walios.com", role: "Client Success Lead", region: "London" },
  { id: "tm_3", name: "Hamza Siddiqui", email: "hamza@walios.com", role: "Automation Engineer", region: "Karachi" },
  { id: "tm_4", name: "Sofia Martins", email: "sofia@walios.com", role: "Content Strategist", region: "Lisbon" },
];

export const worldClocks = [
  { city: "Dubai", tz: "Asia/Dubai" },
  { city: "London", tz: "Europe/London" },
  { city: "New York", tz: "America/New_York" },
  { city: "Sydney", tz: "Australia/Sydney" },
];
