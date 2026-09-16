/**
 * Shared data shapes for JARVIS.
 *
 * These mirror the eventual Hermes/OpenClaw-backed models so the mocked
 * frontend can be wired to a real backend later without reshaping the UI.
 */

export type StatusTone =
  | "active"
  | "success"
  | "warning"
  | "error"
  | "waiting"
  | "idle";

export type NewsCategory =
  | "AI/ML"
  | "Hardware"
  | "Developer Tools"
  | "Policy"
  | "Research"
  | "Security";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: NewsCategory;
  publishedAt: string; // ISO 8601
  url?: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  albumArtUrl?: string;
  durationSec: number;
  positionSec: number;
  isPlaying: boolean;
  liked: boolean;
  outputDevice: string;
  volumePercent: number;
}

export type SystemMetricKind = "cpu" | "gpu" | "ram" | "disk";

export interface SystemMetric {
  kind: SystemMetricKind;
  label: string;
  /** 0-100, or null when this machine doesn't expose the signal (e.g. no GPU-load driver) — never fabricated. */
  percent: number | null;
}

export interface SystemStatus {
  metrics: SystemMetric[];
  temperatureC: number | null;
  uptime: string;
  networkDownMbps: number | null;
  networkUpMbps: number | null;
}

export type WeatherCondition = "clear" | "clouds" | "rain" | "snow";

export interface WeatherStatus {
  temperatureC: number;
  condition: WeatherCondition;
  label: string;
}

export interface ScheduleItem {
  id: string;
  time: string; // display string, e.g. "10:00 PM"
  title: string;
  day: "today" | "tomorrow";
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string; // lucide-react icon name
}

export type TaskPriority = "high" | "medium" | "low";
export type TaskListStatus = "today" | "upcoming" | "completed";

export interface Task {
  id: string;
  title: string;
  priority: TaskPriority;
  time?: string;
  status: TaskListStatus;
  done?: boolean;
}

export interface RecentFile {
  id: string;
  name: string;
  path: string;
  kind: "code" | "style" | "doc";
  updatedAgo: string;
}

export type MissionStatus = "running" | "paused" | "completed" | "failed";
export type AgentActivityStatus = "executing" | "working" | "waiting" | "idle";

export interface MissionAgent {
  name: string;
  status: AgentActivityStatus;
}

export interface Mission {
  id: string;
  name: string;
  status: MissionStatus;
  progressPercent: number;
  objective: string;
  agents: MissionAgent[];
  nextStep: string;
}

export type ProviderStatus = "online" | "degraded" | "rate_limited" | "offline";

export interface ProviderAccount {
  id: string;
  label: string;
  quotaPercent: number;
  resetIn: string;
  status: ProviderStatus;
}

export interface ProviderMetric {
  label: string;
  percent: number;
}

/** A model provider, aggregated across every account JARVIS has for it. */
export interface Provider {
  id: string;
  name: string;
  status: ProviderStatus;
  accounts: ProviderAccount[];
  aggregateQuotaPercent: number;
  metrics: ProviderMetric[];
  resetIn: string;
}

export interface FocusStats {
  focusMinutesToday: number;
  sessionsToday: number;
  streakDays: number;
}

export interface EnvironmentControl {
  id: string;
  label: string;
  enabled: boolean;
}
