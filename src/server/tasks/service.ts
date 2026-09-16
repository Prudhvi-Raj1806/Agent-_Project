import { newId, nowIso } from "@/server/db/util";
import { countTasks, getTaskById, insertTask, listTasks, updateTask } from "./repository";
import type { CreateTaskInput, Task, UpdateTaskInput } from "./types";

export class TaskNotFoundError extends Error {
  constructor(id: string) {
    super(`Task not found: ${id}`);
    this.name = "TaskNotFoundError";
  }
}

/**
 * First-run seed so the app doesn't start with an empty Tasks panel — these
 * are ordinary rows the user can edit/complete/delete like any other task,
 * not a fixture that gets re-applied later.
 */
const SEED_TASKS: CreateTaskInput[] = [
  { title: "Finish JARVIS UI designs", priority: "high", time: "10:00 PM", status: "today" },
  { title: "Gym", priority: "medium", time: "11:30 PM", status: "today" },
  { title: "Team sync (Hackathon)", priority: "medium", time: "2:00 PM", status: "today" },
  { title: "Read / Research", priority: "low", time: "7:00 PM", status: "today" },
  { title: "Plan next development sprint", priority: "low", status: "today" },
  { title: "Update documentation", priority: "low", status: "today" },
  { title: "Refactor auth middleware", priority: "medium", time: "Mon", status: "upcoming" },
  { title: "Write Q3 retro notes", priority: "low", time: "Wed", status: "upcoming" },
];

function seedIfEmpty(): void {
  if (countTasks() > 0) return;
  for (const seed of SEED_TASKS) {
    createTask(seed);
  }
}

export function createTask(input: CreateTaskInput): Task {
  const now = nowIso();
  const task: Task = {
    id: newId("task"),
    title: input.title.trim(),
    priority: input.priority ?? "medium",
    time: input.time ?? null,
    status: input.status ?? "today",
    done: false,
    createdAt: now,
    updatedAt: now,
  };
  insertTask(task);
  return task;
}

export function listAllTasks(): Task[] {
  seedIfEmpty();
  return listTasks();
}

export function updateTaskFields(id: string, patch: UpdateTaskInput): Task {
  const task = getTaskById(id);
  if (!task) throw new TaskNotFoundError(id);

  const updated: Task = {
    ...task,
    title: patch.title !== undefined ? patch.title.trim() : task.title,
    priority: patch.priority ?? task.priority,
    time: patch.time !== undefined ? patch.time : task.time,
    status: patch.status ?? task.status,
    done: patch.done !== undefined ? patch.done : task.done,
    updatedAt: nowIso(),
  };
  updateTask(updated);
  return updated;
}

export function toggleTaskDone(id: string): Task {
  const task = getTaskById(id);
  if (!task) throw new TaskNotFoundError(id);
  return updateTaskFields(id, { done: !task.done });
}
