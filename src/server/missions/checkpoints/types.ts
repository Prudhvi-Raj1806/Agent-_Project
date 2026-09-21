/**
 * A real, minimal checkpoint: mission state captured at a meaningful moment.
 * Distinct from `Mission.checkpoints` (the JSON column on the `missions`
 * table) — that field predates this module, was never written to by any
 * code path, and is superseded by this dedicated table (same relationship
 * as `mission_tasks` to a hypothetical inline task array). Not removed
 * outright to avoid an unrelated schema/type churn; just no longer the
 * canonical home for checkpoint data. See JARVIS_MASTER_MEMORY.md.
 */
export interface MissionCheckpoint {
  id: string;
  missionId: string;
  label: string;
  state: Record<string, unknown>;
  createdAt: string;
}
