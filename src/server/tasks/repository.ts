import { getDb } from "@/server/db/client";
import type { Task, TaskListStatus, TaskPriority } from "./types";

interface TaskRow {
  id: string;
  title: string;
  priority: string;
  time: string | null;
  status: string;
  done: number;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority as TaskPriority,
    time: row.time,
    status: row.status as TaskListStatus,
    done: Boolean(row.done),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertTask(task: Task): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO tasks (id, title, priority, time, status, done, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    task.id,
    task.title,
    task.priority,
    task.time,
    task.status,
    task.done ? 1 : 0,
    task.createdAt,
    task.updatedAt
  );
}

export function updateTask(task: Task): void {
  const db = getDb();
  db.prepare(
    `UPDATE tasks SET title = ?, priority = ?, time = ?, status = ?, done = ?, updated_at = ? WHERE id = ?`
  ).run(task.title, task.priority, task.time, task.status, task.done ? 1 : 0, task.updatedAt, task.id);
}

export function getTaskById(id: string): Task | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as unknown as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

export function listTasks(): Task[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM tasks ORDER BY created_at ASC, rowid ASC`)
    .all() as unknown as TaskRow[];
  return rows.map(rowToTask);
}

export function countTasks(): number {
  const db = getDb();
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM tasks`).get() as { count: number };
  return count;
}
