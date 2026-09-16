export type EventType =
  | "mission.created"
  | "mission.started"
  | "mission.paused"
  | "mission.resumed"
  | "mission.progress"
  | "mission.completed"
  | "mission.failed"
  | "mission.cancelled"
  | "agent.started"
  | "agent.progress"
  | "agent.completed"
  | "agent.failed"
  | "model.requested"
  | "model.selected"
  | "model.completed"
  | "model.failed"
  | "tool.requested"
  | "tool.approved"
  | "tool.denied"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "verification.started"
  | "verification.completed"
  | "verification.failed"
  | "security.blocked"
  | "security.approval_required"
  | "memory.created"
  | "memory.updated"
  | "knowledge.updated";

/**
 * Operational event — observable system activity, not private model
 * reasoning. `metadata` must stay structured/serializable; never put
 * chain-of-thought or secrets in it (logger-style redaction is NOT applied
 * here, since events are persisted and streamed verbatim to the frontend).
 */
export interface JarvisEvent {
  id: string;
  type: EventType;
  timestamp: string;
  missionId?: string | null;
  agentId?: string | null;
  source: string;
  status?: string | null;
  metadata: Record<string, unknown>;
}

export type EmitInput = Omit<JarvisEvent, "id" | "timestamp" | "metadata"> & {
  metadata?: Record<string, unknown>;
};
