/**
 * The smallest real foundation for future safe retries (Sprint 03 Section
 * 9): a stable way to name "this specific execution attempt," built from
 * IDs that already exist (`missionId`, a mission task's `id`, a Hermes
 * `toolCallId`) — no new database, no new ID scheme. This module does NOT
 * suppress or dedupe anything; it only gives a caller a deterministic key
 * to record alongside a failure, so a future retry/idempotency system has
 * something real to key off of instead of inventing one from scratch.
 */
export interface ExecutionIdentity {
  missionId: string;
  taskId: string | null;
  toolCallId: string | null;
}

/** Deterministic and stable: the same identity always produces the same key, and different identities never collide (each segment is delimited). */
export function executionIdentityKey(identity: ExecutionIdentity): string {
  return `${identity.missionId}:${identity.taskId ?? "-"}:${identity.toolCallId ?? "-"}`;
}
