import { newId, nowIso } from "@/server/db/util";
import { recordAudit } from "@/server/security/audit";
import { authorizeMissionCreation, type MissionPolicyInput } from "@/server/security/policy";
import type { Actor } from "@/server/security/types";
import { emitEvent } from "@/server/events/service";
import { NotFoundError, PolicyError, ValidationError } from "./errors";
import { getMissionById, insertMission, listMissions, updateMission } from "./repository";
import { assertTransition } from "./state-machine";
import type {
  CreateMissionInput,
  Mission,
  MissionAgentAssignment,
  MissionStatus,
  PendingToolApproval,
  TransitionOptions,
} from "./types";

const ACTIVE_STATUSES: MissionStatus[] = [
  "QUEUED",
  "RUNNING",
  "PAUSED",
  "WAITING_USER",
  "WAITING_EXTERNAL",
  "BLOCKED",
];

export function createMission(input: CreateMissionInput, actor: Actor): Mission {
  if (!input || typeof input.objective !== "string" || !input.objective.trim()) {
    throw new ValidationError("`objective` is required and must be a non-empty string.");
  }

  const policyInput: MissionPolicyInput = {
    objective: input.objective,
    allowedTools: input.allowedTools,
    forbiddenActions: input.forbiddenActions,
  };
  const decision = authorizeMissionCreation(policyInput);
  if (!decision.allowed) {
    recordAudit({ actorId: actor.id, action: "mission.create", result: "denied", reason: decision.reason });
    emitEvent({
      type: "security.blocked",
      source: "security",
      status: "denied",
      metadata: { action: "mission.create", reason: decision.reason },
    });
    throw new PolicyError(decision.reason ?? "Mission creation was denied by policy.");
  }

  const now = nowIso();
  const mission: Mission = {
    id: newId("mission"),
    objective: input.objective.trim(),
    successCriteria: input.successCriteria ?? [],
    constraints: input.constraints ?? [],
    forbiddenActions: input.forbiddenActions ?? [],
    allowedTools: input.allowedTools ?? [],
    budget: input.budget ?? null,
    deadline: input.deadline ?? null,
    status: "QUEUED",
    progress: 0,
    currentObjective: null,
    agents: [],
    risks: [],
    unknowns: [],
    assumptions: [],
    checkpoints: [],
    result: null,
    verification: null,
    pendingToolApproval: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  insertMission(mission);
  recordAudit({ actorId: actor.id, action: "mission.create", resourceType: "mission", resourceId: mission.id, result: "allowed" });
  emitEvent({
    type: "mission.created",
    missionId: mission.id,
    source: "mission-service",
    status: "queued",
    metadata: { objective: mission.objective },
  });

  return mission;
}

export function getMission(id: string): Mission | null {
  return getMissionById(id);
}

export function requireMission(id: string): Mission {
  const mission = getMissionById(id);
  if (!mission) throw new NotFoundError(`Mission not found: ${id}`);
  return mission;
}

export function listAllMissions(): Mission[] {
  return listMissions();
}

/** Missions still in flight — excludes COMPLETED/FAILED/CANCELLED. */
export function listActiveMissions(): Mission[] {
  return listMissions().filter((m) => ACTIVE_STATUSES.includes(m.status));
}

/** Genuine status changes only — validated against the mission state machine. */
export function transitionMission(id: string, to: MissionStatus, opts: TransitionOptions = {}): Mission {
  const mission = requireMission(id);
  assertTransition(mission.status, to);

  const isTerminal = to === "COMPLETED" || to === "FAILED" || to === "CANCELLED";
  const updated: Mission = {
    ...mission,
    status: to,
    result: opts.result !== undefined ? opts.result : mission.result,
    verification: opts.verification !== undefined ? opts.verification : mission.verification,
    updatedAt: nowIso(),
    completedAt: isTerminal ? nowIso() : mission.completedAt,
  };
  updateMission(updated);
  return updated;
}

/** Progress ticks within the current (already-RUNNING) status — not a state transition. */
export function updateMissionProgress(id: string, progress: number, currentObjective?: string): Mission {
  const mission = requireMission(id);
  const updated: Mission = {
    ...mission,
    progress,
    currentObjective: currentObjective ?? mission.currentObjective,
    updatedAt: nowIso(),
  };
  updateMission(updated);
  return updated;
}

/** Updates the agent-assignment roster shown on the mission (e.g. Hermes starting/finishing). */
export function updateMissionAgents(id: string, agents: MissionAgentAssignment[]): Mission {
  const mission = requireMission(id);
  const updated: Mission = { ...mission, agents, updatedAt: nowIso() };
  updateMission(updated);
  return updated;
}

/** Marks a tool call as blocked on a human decision. */
export function setPendingToolApproval(id: string, approval: PendingToolApproval): Mission {
  const mission = requireMission(id);
  const updated: Mission = { ...mission, pendingToolApproval: approval, updatedAt: nowIso() };
  updateMission(updated);
  return updated;
}

/** Clears the pending approval once it's been resolved (allowed or denied). */
export function clearPendingToolApproval(id: string): Mission {
  const mission = requireMission(id);
  const updated: Mission = { ...mission, pendingToolApproval: null, updatedAt: nowIso() };
  updateMission(updated);
  return updated;
}

export { InvalidTransitionError } from "./state-machine";
export { NotFoundError, PolicyError, ValidationError } from "./errors";
