"use client";

import { useState } from "react";
import { Plus, SquareCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import type { Task, TaskListStatus, TaskPriority } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const tabs: { id: TaskListStatus; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
];

const priorityStyle: Record<TaskPriority, string> = {
  high: "bg-accent-cyan/15 text-accent-cyan",
  medium: "bg-accent-violet/15 text-accent-violet",
  low: "bg-status-success/15 text-status-success",
};

export function TasksPanel({ tasks: initialTasks, className }: { tasks: Task[]; className?: string }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTab, setActiveTab] = useState<TaskListStatus>("today");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const items = tasks.filter((t) => t.status === activeTab);

  async function toggle(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const nextDone = !task.done;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: nextDone } : t)));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: nextDone }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !nextDone } : t)));
    }
  }

  async function addTask() {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    setDraft("");
    setAdding(false);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, status: activeTab === "completed" ? "today" : activeTab }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setTasks((prev) => [...prev, data.task]);
    } catch {
      // Silent — the task simply won't appear; no local state to roll back.
    }
  }

  return (
    <Panel className={className}>
      <PanelHeader
        title="Tasks"
        action={
          <Button variant="outline" size="sm" className="bg-surface-1" onClick={() => setAdding(true)}>
            <Plus />
            Add task
          </Button>
        }
      />
      <div className="mt-3 flex shrink-0 items-center gap-4 border-b border-border px-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative pb-2.5 text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent-cyan" />
            )}
          </button>
        ))}
      </div>
      <PanelBody className="no-scrollbar overflow-y-auto pt-2.5">
        {adding && (
          <div className="mb-1 flex items-center gap-1.5 px-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTask();
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              onBlur={addTask}
              placeholder="New task title…"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-cyan/40 focus:outline-none"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <ul className="space-y-1">
          {items.map((task) => {
            const isChecked = task.done;
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => toggle(task.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                      isChecked
                        ? "border-accent-cyan bg-accent-cyan text-background"
                        : "border-border-strong text-transparent"
                    )}
                  >
                    <SquareCheck className="size-3" strokeWidth={2.5} fill="none" />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      isChecked ? "text-text-dim line-through" : "text-foreground"
                    )}
                  >
                    {task.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                      priorityStyle[task.priority]
                    )}
                  >
                    {task.priority}
                  </span>
                  {task.time && (
                    <span className="shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {task.time}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PanelBody>
    </Panel>
  );
}
