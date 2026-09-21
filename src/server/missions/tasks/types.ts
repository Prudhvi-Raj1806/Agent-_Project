import type { HermesResult } from "@/server/hermes/types";

/**
 * Deliberately smaller than MissionStatus: a task can't honestly be
 * WAITING_USER/WAITING_EXTERNAL (those are pipeline-mechanics, not
 * task-completion states) or QUEUED (a task only exists once its mission
 * has started).
 */
export type MissionTaskStatus = "pending" | "running" | "blocked" | "completed" | "failed" | "cancelled";

/** Same shape as Mission.result today — its own alias so the two can diverge later. */
export type MissionTaskResult = HermesResult;

export interface MissionTask {
  id: string;
  missionId: string;
  parentId: string | null;
  title: string;
  status: MissionTaskStatus;
  /** Deterministic sibling ordering. Always 0 today — one root task per mission. */
  sequence: number;
  /** IDs of other MissionTasks this one depends on. Always [] today — no real decomposition yet. */
  dependsOn: string[];
  result: MissionTaskResult | null;
  createdAt: string;
  updatedAt: string;
}
