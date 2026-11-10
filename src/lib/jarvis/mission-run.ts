import { isSettledStatus } from "./mission-speech";
import type { Mission } from "@/server/missions/types";

export interface MissionRunDeps {
  createMission: (objective: string) => Promise<Mission>;
  getMission: (id: string) => Promise<Mission>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  intervalMs: number;
  timeoutMs: number;
}

/**
 * Creates a mission and polls it until it finishes or stops to wait on
 * something. If it's still running at the timeout the still-running mission
 * is returned (not an error) so the caller can say so honestly. Deps are
 * injected so the loop is testable without a network or real clock.
 */
export async function runMissionToSettled(
  objective: string,
  deps: MissionRunDeps,
  signal?: AbortSignal,
): Promise<Mission> {
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Mission run aborted.", "AbortError");
  };

  throwIfAborted();
  let mission = await deps.createMission(objective);
  const startedAt = deps.now();

  for (;;) {
    throwIfAborted();
    mission = await deps.getMission(mission.id);
    throwIfAborted();
    if (isSettledStatus(mission.status)) return mission;
    if (deps.now() - startedAt >= deps.timeoutMs) return mission;
    await deps.sleep(deps.intervalMs);
  }
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

/** The browser implementation of the deps, talking to the app's own missions API. */
export function browserMissionRunDeps(): MissionRunDeps {
  return {
    createMission: async (objective) => {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective }),
      });
      const data = await readJson<{ mission: Mission }>(res);
      if (!res.ok || !data.mission) throw new Error(data.error ?? "Couldn't create that mission.");
      return data.mission;
    },
    getMission: async (id) => {
      const res = await fetch(`/api/missions/${id}`);
      const data = await readJson<{ mission: Mission }>(res);
      if (!res.ok || !data.mission) throw new Error(data.error ?? "Couldn't read that mission.");
      return data.mission;
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    intervalMs: 1000,
    timeoutMs: 180_000,
  };
}
