import { newId, nowIso } from "@/server/db/util";
import { getMissionTaskById, insertMissionTask, listMissionTasksByMission, updateMissionTask } from "./repository";
import type { MissionTask, MissionTaskResult, MissionTaskStatus } from "./types";

/**
 * Phase 01 has no real planning intelligence (that's Phase 07's Autonomous
 * Planner territory) — decomposition here is intentionally trivial: exactly
 * one root MissionTask mirrors the mission's whole objective. `dependsOn`/
 * `parentId` exist so a future planner can attach a real dependency graph
 * without another migration; nothing populates them today.
 *
 * Idempotent: safe to call from both a fresh start and every resume — it
 * creates the row only the first time, and on later calls just reactivates
 * (pending/blocked -> running) without inserting a duplicate.
 */
export function ensureRootTask(missionId: string, objective: string): MissionTask {
  const [root] = listMissionTasksByMission(missionId);
  if (root) {
    return root.status === "blocked" || root.status === "pending" ? setStatus(root, "running") : root;
  }

  const now = nowIso();
  const task: MissionTask = {
    id: newId("mtask"),
    missionId,
    parentId: null,
    title: objective,
    status: "running",
    sequence: 0,
    dependsOn: [],
    result: null,
    createdAt: now,
    updatedAt: now,
  };
  insertMissionTask(task);
  return task;
}

function setStatus(task: MissionTask, status: MissionTaskStatus, result?: MissionTaskResult | null): MissionTask {
  const updated: MissionTask = {
    ...task,
    status,
    result: result !== undefined ? result : task.result,
    updatedAt: nowIso(),
  };
  updateMissionTask(updated);
  return updated;
}

/** No-op (returns null) if the mission has no root task yet — defensive; every code path calls ensureRootTask first. */
export function markRootTaskStatus(
  missionId: string,
  status: MissionTaskStatus,
  result?: MissionTaskResult | null
): MissionTask | null {
  const [root] = listMissionTasksByMission(missionId);
  return root ? setStatus(root, status, result) : null;
}

export function listMissionTasks(missionId: string): MissionTask[] {
  return listMissionTasksByMission(missionId);
}

export { getMissionTaskById };
export type { MissionTask, MissionTaskResult, MissionTaskStatus } from "./types";
