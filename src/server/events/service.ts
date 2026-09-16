import { newId, nowIso } from "@/server/db/util";
import { logger } from "@/server/logging/logger";
import { publish } from "./bus";
import { insertEvent } from "./repository";
import type { EmitInput, JarvisEvent } from "./types";

/** Persist + publish an operational event. This is the only way events should be created. */
export function emitEvent(input: EmitInput): JarvisEvent {
  const event: JarvisEvent = {
    id: newId("evt"),
    timestamp: nowIso(),
    metadata: input.metadata ?? {},
    type: input.type,
    missionId: input.missionId ?? null,
    agentId: input.agentId ?? null,
    source: input.source,
    status: input.status ?? null,
  };
  insertEvent(event);
  publish(event);
  logger.info(event.type, { missionId: event.missionId, agentId: event.agentId, status: event.status });
  return event;
}

export { listEventsForMission, listRecentEvents } from "./repository";
export { subscribe } from "./bus";
export type { EventType, JarvisEvent } from "./types";
