import { listRecentEvents } from "@/server/events/service";
import type { JarvisEvent } from "@/server/events/types";
import { getMission } from "@/server/missions/service";
import { shortenObjective } from "@/lib/work/mission-mapping";

export interface Notification {
  id: string;
  message: string;
  timestamp: string;
  tone: "success" | "error" | "warning";
}

const NOTABLE_TYPES = new Set(["mission.completed", "mission.failed", "mission.cancelled", "security.blocked"]);

function describeMission(missionId: string | null | undefined): string {
  if (!missionId) return "a mission";
  const mission = getMission(missionId);
  return mission ? shortenObjective(mission.objective) : missionId;
}

function describe(event: JarvisEvent): Notification {
  switch (event.type) {
    case "mission.completed":
      return {
        id: event.id,
        message: `Mission completed: ${describeMission(event.missionId)}`,
        timestamp: event.timestamp,
        tone: "success",
      };
    case "mission.failed":
      return {
        id: event.id,
        message: `Mission failed: ${describeMission(event.missionId)}`,
        timestamp: event.timestamp,
        tone: "error",
      };
    case "mission.cancelled":
      return {
        id: event.id,
        message: `Mission cancelled: ${describeMission(event.missionId)}`,
        timestamp: event.timestamp,
        tone: "warning",
      };
    case "security.blocked": {
      const reason = typeof event.metadata.reason === "string" ? event.metadata.reason : "policy";
      return { id: event.id, message: `Blocked by policy: ${reason}`, timestamp: event.timestamp, tone: "warning" };
    }
    default:
      return { id: event.id, message: event.type, timestamp: event.timestamp, tone: "warning" };
  }
}

export function listNotifications(limit = 20): Notification[] {
  return listRecentEvents(200)
    .filter((e) => NOTABLE_TYPES.has(e.type))
    .slice(0, limit)
    .map(describe);
}
