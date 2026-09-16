import type { AgentActivityStatus, Mission as UiMission, MissionStatus as UiMissionStatus } from "@/lib/data/types";

/**
 * Backend <-> UI mission shape mapping. Client-safe (no server-only imports)
 * so both the server-side work view (`@/server/work/view.ts`) and the
 * client-side live-update hook (`use-live-missions.ts`) share one source of
 * truth for how backend statuses collapse into the UI's simpler enum.
 */

export type BackendMissionStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "WAITING_USER"
  | "WAITING_EXTERNAL"
  | "BLOCKED"
  | "FAILED"
  | "COMPLETED"
  | "CANCELLED";

export type BackendAgentStatus = "idle" | "working" | "waiting" | "completed" | "failed";

export const MISSION_STATUS_MAP: Record<BackendMissionStatus, UiMissionStatus> = {
  QUEUED: "paused",
  RUNNING: "running",
  PAUSED: "paused",
  WAITING_USER: "paused",
  WAITING_EXTERNAL: "paused",
  BLOCKED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "failed",
};

export const AGENT_STATUS_MAP: Record<BackendAgentStatus, AgentActivityStatus> = {
  idle: "idle",
  waiting: "waiting",
  working: "executing",
  completed: "working",
  failed: "idle",
};

export function shortenObjective(objective: string, maxWords = 8): string {
  const words = objective.trim().split(/\s+/);
  if (words.length <= maxWords) return objective;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export function describeNextStep(status: BackendMissionStatus, currentObjective: string | null): string {
  if (currentObjective) return currentObjective;
  if (status === "QUEUED") return "Awaiting execution";
  if (status === "FAILED" || status === "CANCELLED") return "Stopped";
  return "—";
}

const ACTIVE_UI_STATUSES: UiMissionStatus[] = ["running", "paused"];

/** True once a mission has left the live-updating set (matches `listActiveMissions()` server-side). */
export function isMissionTerminal(status: UiMissionStatus): boolean {
  return !ACTIVE_UI_STATUSES.includes(status);
}

interface LiveEventLike {
  type: string;
  agentId?: string | null;
  metadata: Record<string, unknown>;
}

const AGENT_EVENT_BACKEND_STATUS: Record<string, BackendAgentStatus> = {
  "agent.started": "working",
  "agent.progress": "working",
  "agent.completed": "completed",
  "agent.failed": "failed",
};

/** The event types `applyMissionEvent` knows how to fold into a UI mission. */
export const RELEVANT_LIVE_EVENT_TYPES = [
  "mission.started",
  "mission.progress",
  "mission.paused",
  "mission.resumed",
  "mission.completed",
  "mission.failed",
  "mission.cancelled",
  "agent.started",
  "agent.progress",
  "agent.completed",
  "agent.failed",
] as const;

/** Applies one live SSE event to a UI-shaped mission — the client-side mirror of the status changes `work/view.ts` would produce from a fresh server read. */
export function applyMissionEvent(mission: UiMission, event: LiveEventLike): UiMission {
  switch (event.type) {
    case "mission.started":
    case "mission.resumed":
      return { ...mission, status: "running" };
    case "mission.paused":
      return { ...mission, status: "paused" };
    case "mission.progress": {
      const percent = event.metadata.percent;
      const note = event.metadata.note;
      return {
        ...mission,
        progressPercent: typeof percent === "number" ? percent : mission.progressPercent,
        nextStep: typeof note === "string" ? note : mission.nextStep,
      };
    }
    case "mission.completed":
      return { ...mission, status: "completed", progressPercent: 100, nextStep: "Completed" };
    case "mission.failed":
    case "mission.cancelled":
      return { ...mission, status: "failed", nextStep: "Stopped" };
    case "agent.started":
    case "agent.progress":
    case "agent.completed":
    case "agent.failed": {
      if (!event.agentId) return mission;
      const backendStatus = AGENT_EVENT_BACKEND_STATUS[event.type];
      const uiStatus = AGENT_STATUS_MAP[backendStatus];
      return {
        ...mission,
        agents: mission.agents.map((agent) =>
          agent.name.toLowerCase() === event.agentId ? { ...agent, status: uiStatus } : agent
        ),
      };
    }
    default:
      return mission;
  }
}
