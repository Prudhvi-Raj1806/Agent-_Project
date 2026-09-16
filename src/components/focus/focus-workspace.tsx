"use client";

import { useState } from "react";
import { FocusSessionPanel } from "@/components/focus/focus-session-panel";
import type { EnvironmentControl, FocusStats, Task } from "@/lib/data/types";
import { formatMinutesAsHoursMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FocusWorkspace({
  tasks,
  stats,
  environmentControls,
}: {
  tasks: Task[];
  stats: FocusStats;
  environmentControls: EnvironmentControl[];
}) {
  const upNext = tasks.filter((t) => t.status === "today" && !t.done);
  const [objective, setObjective] = useState(upNext[0]?.title ?? "No objective set");
  const [controls, setControls] = useState(environmentControls);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-4 pt-2">
      <FocusSessionPanel objective={objective} />

      {upNext.length > 0 && (
        <div className="flex max-w-2xl flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-text-dim">Up next:</span>
          {upNext.map((task) => {
            const isActive = task.title === objective;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => setObjective(task.title)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan"
                    : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
                )}
              >
                {task.title}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <span className="text-foreground">{formatMinutesAsHoursMinutes(stats.focusMinutesToday)}</span>{" "}
        focused today &middot; {stats.sessionsToday} sessions &middot; {stats.streakDays}-day streak
      </p>

      <div className="flex w-full max-w-xs flex-col">
        {controls.map((control) => (
          <button
            key={control.id}
            type="button"
            aria-pressed={control.enabled}
            onClick={() =>
              setControls((prev) =>
                prev.map((c) => (c.id === control.id ? { ...c, enabled: !c.enabled } : c))
              )
            }
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  control.enabled ? "bg-accent-violet" : "border border-border-strong"
                )}
              />
              <span
                className={cn(
                  "text-xs",
                  control.enabled ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {control.label}
              </span>
            </span>
            {control.enabled && (
              <span className="text-[10px] font-medium tracking-wide text-accent-violet uppercase">
                Active
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
