import type { SQLInputValue } from "node:sqlite";
import { getDb } from "@/server/db/client";
import { fromJson, toJson } from "@/server/db/util";
import type { MissionCheckpoint } from "./types";

interface MissionCheckpointRow {
  id: string;
  mission_id: string;
  label: string;
  state: string;
  created_at: string;
}

function rowToCheckpoint(row: MissionCheckpointRow): MissionCheckpoint {
  return {
    id: row.id,
    missionId: row.mission_id,
    label: row.label,
    state: fromJson<Record<string, unknown>>(row.state, {}),
    createdAt: row.created_at,
  };
}

export function insertMissionCheckpoint(checkpoint: MissionCheckpoint): void {
  const db = getDb();
  const params: SQLInputValue[] = [
    checkpoint.id,
    checkpoint.missionId,
    checkpoint.label,
    toJson(checkpoint.state),
    checkpoint.createdAt,
  ];
  db.prepare(`INSERT INTO checkpoints (id, mission_id, label, state, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    ...params
  );
}

export function listMissionCheckpointsByMission(missionId: string): MissionCheckpoint[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM checkpoints WHERE mission_id = ? ORDER BY created_at ASC, rowid ASC`)
    .all(missionId) as unknown as MissionCheckpointRow[];
  return rows.map(rowToCheckpoint);
}
