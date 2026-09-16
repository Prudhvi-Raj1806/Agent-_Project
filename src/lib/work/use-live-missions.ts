"use client";

import { useEffect, useState } from "react";
import type { Mission } from "@/lib/data/types";
import { RELEVANT_LIVE_EVENT_TYPES, applyMissionEvent, isMissionTerminal } from "./mission-mapping";

/**
 * Keeps a mission list current via SSE, without a page refresh. `initialMissions`
 * (the server-rendered snapshot) is the source of truth for which missions exist
 * and for any mission this hook hasn't started tracking yet; once tracked, a
 * mission's fields are only updated by its own event stream, not overwritten by
 * a later server snapshot, so a fast-moving live update never gets clobbered by
 * a slightly-stale prop.
 */
export function useLiveMissions(initialMissions: Mission[]): Mission[] {
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [trackedInitial, setTrackedInitial] = useState(initialMissions);

  // Reconcile during render (not in an effect) when the server snapshot changes:
  // keep any mission we're already tracking live, adopt any new one as-is.
  if (initialMissions !== trackedInitial) {
    setTrackedInitial(initialMissions);
    setMissions((prev) => {
      const prevById = new Map(prev.map((m) => [m.id, m]));
      return initialMissions.map((incoming) => prevById.get(incoming.id) ?? incoming);
    });
  }

  const activeIdsKey = missions
    .filter((m) => !isMissionTerminal(m.status))
    .map((m) => m.id)
    .join(",");

  useEffect(() => {
    if (!activeIdsKey) return;
    const ids = activeIdsKey.split(",");

    const sources = ids.map((id) => {
      const source = new EventSource(`/api/missions/${id}/events`);
      const handler = (e: MessageEvent) => {
        let event: { type: string; agentId?: string | null; metadata: Record<string, unknown> };
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }
        setMissions((prev) => prev.map((m) => (m.id === id ? applyMissionEvent(m, event) : m)));
      };
      RELEVANT_LIVE_EVENT_TYPES.forEach((type) => source.addEventListener(type, handler));
      return source;
    });

    return () => sources.forEach((source) => source.close());
    // Resubscribe only when the SET of active mission ids changes, not on every field update.
  }, [activeIdsKey]);

  return missions;
}
