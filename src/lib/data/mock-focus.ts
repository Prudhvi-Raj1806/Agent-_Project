import type { EnvironmentControl, FocusStats } from "./types";

export const mockFocusStats: FocusStats = {
  focusMinutesToday: 165,
  sessionsToday: 4,
  streakDays: 6,
};

export const mockEnvironmentControls: EnvironmentControl[] = [
  { id: "dnd", label: "Do Not Disturb", enabled: true },
  { id: "notifications", label: "Silence Notifications", enabled: true },
  { id: "block-sites", label: "Block Distracting Sites", enabled: false },
];
