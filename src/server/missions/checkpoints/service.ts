import { newId, nowIso } from "@/server/db/util";
import { insertMissionCheckpoint, listMissionCheckpointsByMission } from "./repository";
import type { MissionCheckpoint } from "./types";

/**
 * Phase 01's checkpoint deliverable, scoped honestly like the root-task
 * model before it: a checkpoint is real captured state (not a fabricated
 * placeholder), created at exactly one well-defined moment today —
 * `pauseMission()`, the one point where an owner explicitly asks JARVIS to
 * preserve where a mission stood. No automatic periodic checkpointing, no
 * resume-from-checkpoint logic yet (resume already replays from the
 * mission's own persisted progress — see orchestrator.ts) — those are
 * genuinely separate features, not implied by "checkpoints" existing.
 */
export function createCheckpoint(missionId: string, label: string, state: Record<string, unknown>): MissionCheckpoint {
  const checkpoint: MissionCheckpoint = {
    id: newId("chk"),
    missionId,
    label,
    state,
    createdAt: nowIso(),
  };
  insertMissionCheckpoint(checkpoint);
  return checkpoint;
}

export function listMissionCheckpoints(missionId: string): MissionCheckpoint[] {
  return listMissionCheckpointsByMission(missionId);
}

export type { MissionCheckpoint } from "./types";
