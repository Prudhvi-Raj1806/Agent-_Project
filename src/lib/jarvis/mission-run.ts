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
  if (signal?.aborted) throw new DOMException("Mission run aborted.", "AbortError");
  const created = await deps.createMission(objective);
  return pollUntilSettled(created.id, deps, signal, undefined);
}

export interface ResumeOptions {
  /**
   * The tool call the owner just answered. The server clears the pending
   * approval a beat after the answer lands, so a poll that still shows this
   * same approval is stale, not a fresh request — keep waiting through it.
   */
  answeredToolCallId?: string;
}

/**
 * Picks an existing mission back up after the owner answered an approval and
 * waits for it to settle again. A different pending approval still settles
 * the wait: that is a new tool call needing its own answer.
 */
export function resumeMissionToSettled(
  missionId: string,
  deps: MissionRunDeps,
  signal?: AbortSignal,
  options: ResumeOptions = {},
): Promise<Mission> {
  return pollUntilSettled(missionId, deps, signal, options.answeredToolCallId);
}

async function pollUntilSettled(
  missionId: string,
  deps: MissionRunDeps,
  signal: AbortSignal | undefined,
  answeredToolCallId: string | undefined,
): Promise<Mission> {
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Mission run aborted.", "AbortError");
  };
  const startedAt = deps.now();

  for (;;) {
    throwIfAborted();
    const mission = await deps.getMission(missionId);
    throwIfAborted();
    const staleApproval =
      answeredToolCallId !== undefined &&
      mission.status === "WAITING_USER" &&
      mission.pendingToolApproval?.toolCallId === answeredToolCallId;
    if (isSettledStatus(mission.status) && !staleApproval) return mission;
    if (deps.now() - startedAt >= deps.timeoutMs) return mission;
    await deps.sleep(deps.intervalMs);
  }
}

/** Sends the owner's ALLOW/DENY for a paused tool call. Throws the server's message if it can't be applied. */
export async function submitToolApproval(
  missionId: string,
  toolCallId: string,
  approved: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(
    `/api/missions/${encodeURIComponent(missionId)}/tool-approvals/${encodeURIComponent(toolCallId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Couldn't send that decision.");
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
