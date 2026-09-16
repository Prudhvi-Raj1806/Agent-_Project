import type { SQLInputValue } from "node:sqlite";
import { getDb } from "@/server/db/client";
import { fromJson, toJson } from "@/server/db/util";
import type {
  Mission,
  MissionAgentAssignment,
  MissionBudget,
  MissionCheckpoint,
  MissionResult,
  MissionStatus,
  PendingToolApproval,
} from "./types";
import type { VerificationResult } from "@/server/verification/types";

interface MissionRow {
  id: string;
  objective: string;
  success_criteria: string;
  constraints: string;
  forbidden_actions: string;
  allowed_tools: string;
  budget: string | null;
  deadline: string | null;
  status: string;
  progress: number;
  current_objective: string | null;
  agents: string;
  risks: string;
  unknowns: string;
  assumptions: string;
  checkpoints: string;
  result: string | null;
  verification: string | null;
  pending_tool_approval: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function rowToMission(row: MissionRow): Mission {
  return {
    id: row.id,
    objective: row.objective,
    successCriteria: fromJson<string[]>(row.success_criteria, []),
    constraints: fromJson<string[]>(row.constraints, []),
    forbiddenActions: fromJson<string[]>(row.forbidden_actions, []),
    allowedTools: fromJson<string[]>(row.allowed_tools, []),
    budget: fromJson<MissionBudget | null>(row.budget, null),
    deadline: row.deadline,
    status: row.status as MissionStatus,
    progress: row.progress,
    currentObjective: row.current_objective,
    agents: fromJson<MissionAgentAssignment[]>(row.agents, []),
    risks: fromJson<string[]>(row.risks, []),
    unknowns: fromJson<string[]>(row.unknowns, []),
    assumptions: fromJson<string[]>(row.assumptions, []),
    checkpoints: fromJson<MissionCheckpoint[]>(row.checkpoints, []),
    result: fromJson<MissionResult | null>(row.result, null),
    verification: fromJson<VerificationResult | null>(row.verification, null),
    pendingToolApproval: fromJson<PendingToolApproval | null>(row.pending_tool_approval, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

const COLUMNS = [
  "id",
  "objective",
  "success_criteria",
  "constraints",
  "forbidden_actions",
  "allowed_tools",
  "budget",
  "deadline",
  "status",
  "progress",
  "current_objective",
  "agents",
  "risks",
  "unknowns",
  "assumptions",
  "checkpoints",
  "result",
  "verification",
  "pending_tool_approval",
  "created_at",
  "updated_at",
  "completed_at",
] as const;

function missionToParams(mission: Mission): SQLInputValue[] {
  return [
    mission.id,
    mission.objective,
    toJson(mission.successCriteria),
    toJson(mission.constraints),
    toJson(mission.forbiddenActions),
    toJson(mission.allowedTools),
    mission.budget ? toJson(mission.budget) : null,
    mission.deadline,
    mission.status,
    mission.progress,
    mission.currentObjective,
    toJson(mission.agents),
    toJson(mission.risks),
    toJson(mission.unknowns),
    toJson(mission.assumptions),
    toJson(mission.checkpoints),
    mission.result ? toJson(mission.result) : null,
    mission.verification ? toJson(mission.verification) : null,
    mission.pendingToolApproval ? toJson(mission.pendingToolApproval) : null,
    mission.createdAt,
    mission.updatedAt,
    mission.completedAt,
  ];
}

export function insertMission(mission: Mission): void {
  const db = getDb();
  const placeholders = COLUMNS.map(() => "?").join(", ");
  db.prepare(`INSERT INTO missions (${COLUMNS.join(", ")}) VALUES (${placeholders})`).run(
    ...missionToParams(mission)
  );
}

export function updateMission(mission: Mission): void {
  const db = getDb();
  const assignments = COLUMNS.filter((c) => c !== "id")
    .map((c) => `${c} = ?`)
    .join(", ");
  const params = missionToParams(mission);
  const [, ...rest] = params;
  db.prepare(`UPDATE missions SET ${assignments} WHERE id = ?`).run(...rest, mission.id);
}

export function getMissionById(id: string): Mission | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM missions WHERE id = ?`).get(id) as unknown as MissionRow | undefined;
  return row ? rowToMission(row) : null;
}

export function listMissions(): Mission[] {
  const db = getDb();
  // rowid tiebreak: created_at alone is ambiguous for missions created within the same millisecond.
  const rows = db
    .prepare(`SELECT * FROM missions ORDER BY created_at DESC, rowid DESC`)
    .all() as unknown as MissionRow[];
  return rows.map(rowToMission);
}
