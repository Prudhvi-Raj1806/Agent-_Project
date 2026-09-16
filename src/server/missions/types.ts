import type { HermesResult } from "@/server/hermes/types";
import type { RiskLevel } from "@/server/security/types";
import type { VerificationResult } from "@/server/verification/types";

export type MissionStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "WAITING_USER"
  | "WAITING_EXTERNAL"
  | "BLOCKED"
  | "FAILED"
  | "COMPLETED"
  | "CANCELLED";

export interface MissionBudget {
  maxUsd?: number;
  maxTokens?: number;
  maxSteps?: number;
}

export interface MissionAgentAssignment {
  id: string;
  role: string;
  status: "idle" | "working" | "waiting" | "completed" | "failed";
}

export interface MissionCheckpoint {
  id: string;
  label: string;
  createdAt: string;
  state: Record<string, unknown>;
}

/** A Hermes execution result, once attached to a mission. */
export type MissionResult = HermesResult;

/** A tool call currently blocked on a human decision (mission.status === "WAITING_USER"). */
export interface PendingToolApproval {
  toolCallId: string;
  toolName: string;
  input: unknown;
  risk: RiskLevel;
  reason: string;
  requestedAt: string;
}

export interface Mission {
  id: string;
  objective: string;
  successCriteria: string[];
  constraints: string[];
  forbiddenActions: string[];
  allowedTools: string[];
  budget: MissionBudget | null;
  deadline: string | null;
  status: MissionStatus;
  progress: number;
  currentObjective: string | null;
  agents: MissionAgentAssignment[];
  risks: string[];
  unknowns: string[];
  assumptions: string[];
  checkpoints: MissionCheckpoint[];
  result: MissionResult | null;
  verification: VerificationResult | null;
  pendingToolApproval: PendingToolApproval | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateMissionInput {
  objective: string;
  successCriteria?: string[];
  constraints?: string[];
  forbiddenActions?: string[];
  allowedTools?: string[];
  budget?: MissionBudget;
  deadline?: string;
}

export interface TransitionOptions {
  result?: MissionResult | null;
  verification?: VerificationResult | null;
}
