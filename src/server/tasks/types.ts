export type TaskPriority = "high" | "medium" | "low";
export type TaskListStatus = "today" | "upcoming" | "completed";

export interface Task {
  id: string;
  title: string;
  priority: TaskPriority;
  time: string | null;
  status: TaskListStatus;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  priority?: TaskPriority;
  time?: string;
  status?: TaskListStatus;
}

export interface UpdateTaskInput {
  title?: string;
  priority?: TaskPriority;
  time?: string | null;
  status?: TaskListStatus;
  done?: boolean;
}
