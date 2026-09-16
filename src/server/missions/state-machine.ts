import type { MissionStatus } from "./types";

/**
 * A mission is an autonomous execution process, not a TODO item — status
 * changes are constrained to a fixed graph so the orchestrator can never
 * silently skip states (e.g. QUEUED straight to COMPLETED).
 */
const TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["PAUSED", "WAITING_USER", "WAITING_EXTERNAL", "BLOCKED", "COMPLETED", "FAILED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLED"],
  WAITING_USER: ["RUNNING", "CANCELLED", "FAILED"],
  WAITING_EXTERNAL: ["RUNNING", "CANCELLED", "FAILED"],
  BLOCKED: ["RUNNING", "CANCELLED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: MissionStatus,
    public readonly to: MissionStatus
  ) {
    super(`Invalid mission transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: MissionStatus, to: MissionStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
