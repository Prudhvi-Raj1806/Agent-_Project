import { getDb } from "@/server/db/client";
import type { ScheduleItem } from "./types";

interface ScheduleRow {
  id: string;
  title: string;
  starts_at: string;
  created_at: string;
  updated_at: string;
}

function rowToItem(row: ScheduleRow): ScheduleItem {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertScheduleItem(item: ScheduleItem): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO schedule_items (id, title, starts_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(item.id, item.title, item.startsAt, item.createdAt, item.updatedAt);
}

export function deleteScheduleItem(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM schedule_items WHERE id = ?`).run(id);
}

export function listScheduleItems(): ScheduleItem[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM schedule_items ORDER BY starts_at ASC`)
    .all() as unknown as ScheduleRow[];
  return rows.map(rowToItem);
}

export function countScheduleItems(): number {
  const db = getDb();
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM schedule_items`).get() as { count: number };
  return count;
}
