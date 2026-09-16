import { listAllTasks } from "./service";
import type { Task as ServerTask } from "./types";
import type { Task as UiTask } from "@/lib/data/types";

/** Adapts backend tasks to the UI's `@/lib/data/types` Task shape — shared by Work and Focus, since tasks aren't mode-specific. */
export function toUiTask(task: ServerTask): UiTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    time: task.time ?? undefined,
    status: task.status,
    done: task.done,
  };
}

export async function getUiTasks(): Promise<UiTask[]> {
  return listAllTasks().map(toUiTask);
}
