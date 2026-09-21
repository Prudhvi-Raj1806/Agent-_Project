import type { SQLInputValue } from "node:sqlite";
import { getDb } from "@/server/db/client";
import { fromJson, toJson } from "@/server/db/util";
import type { MissionTask, MissionTaskResult, MissionTaskStatus } from "./types";

interface MissionTaskRow {
  id: string;
  mission_id: string;
  parent_id: string | null;
  title: string;
  status: string;
  sequence: number;
  depends_on: string;
  result: string | null;
  created_at: string;
  updated_at: string;
}

function rowToMissionTask(row: MissionTaskRow): MissionTask {
  return {
    id: row.id,
    missionId: row.mission_id,
    parentId: row.parent_id,
    title: row.title,
    status: row.status as MissionTaskStatus,
    sequence: row.sequence,
    dependsOn: fromJson<string[]>(row.depends_on, []),
    result: fromJson<MissionTaskResult | null>(row.result, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = [
  "id",
  "mission_id",
  "parent_id",
  "title",
  "status",
  "sequence",
  "depends_on",
  "result",
  "created_at",
  "updated_at",
] as const;

function missionTaskToParams(task: MissionTask): SQLInputValue[] {
  return [
    task.id,
    task.missionId,
    task.parentId,
    task.title,
    task.status,
    task.sequence,
    toJson(task.dependsOn),
    task.result ? toJson(task.result) : null,
    task.createdAt,
    task.updatedAt,
  ];
}

export function insertMissionTask(task: MissionTask): void {
  const db = getDb();
  const placeholders = COLUMNS.map(() => "?").join(", ");
  db.prepare(`INSERT INTO mission_tasks (${COLUMNS.join(", ")}) VALUES (${placeholders})`).run(
    ...missionTaskToParams(task)
  );
}

export function updateMissionTask(task: MissionTask): void {
  const db = getDb();
  const assignments = COLUMNS.filter((c) => c !== "id")
    .map((c) => `${c} = ?`)
    .join(", ");
  const params = missionTaskToParams(task);
  const [, ...rest] = params;
  db.prepare(`UPDATE mission_tasks SET ${assignments} WHERE id = ?`).run(...rest, task.id);
}

export function getMissionTaskById(id: string): MissionTask | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM mission_tasks WHERE id = ?`).get(id) as unknown as MissionTaskRow | undefined;
  return row ? rowToMissionTask(row) : null;
}

export function listMissionTasksByMission(missionId: string): MissionTask[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM mission_tasks WHERE mission_id = ? ORDER BY sequence ASC, created_at ASC, rowid ASC`)
    .all(missionId) as unknown as MissionTaskRow[];
  return rows.map(rowToMissionTask);
}
