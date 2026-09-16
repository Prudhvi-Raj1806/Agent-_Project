"use client";

import { useState } from "react";
import { ChevronDown, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Panel } from "@/components/primitives/panel";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import { TimerRing } from "@/components/primitives/timer-ring";
import { cn } from "@/lib/utils";

const modes = ["Pomodoro", "Deep Work", "Custom"] as const;
const TOTAL_CYCLES = 4;

type SessionPhase = "ready" | "running" | "paused";

function SessionStateBadge({ phase }: { phase: SessionPhase }) {
  if (phase === "running") {
    return <StatusIndicator tone="active" label="Focusing" pulse />;
  }
  if (phase === "paused") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wide text-status-warning uppercase">
        <Pause className="size-2.5" fill="currentColor" />
        Paused
      </span>
    );
  }
  return (
    <span className="text-[11px] font-medium tracking-wide text-text-dim uppercase">Ready</span>
  );
}

export function FocusSessionPanel({
  objective,
  currentCycle = 2,
  className,
}: {
  objective: string;
  currentCycle?: number;
  className?: string;
}) {
  const [mode, setMode] = useState<(typeof modes)[number]>("Pomodoro");
  const [phase, setPhase] = useState<SessionPhase>("ready");

  const toggleRunning = () => setPhase((p) => (p === "running" ? "paused" : "running"));

  return (
    <Panel className={cn("w-full max-w-md", className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium tracking-wide text-foreground uppercase">
            Focus Session
          </span>
          <SessionStateBadge phase={phase} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground">
            {mode}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-32" align="end">
            {modes.map((m) => (
              <DropdownMenuItem key={m} onSelect={() => setMode(m)}>
                {m}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col items-center gap-4 px-5 pt-4 pb-5">
        <TimerRing size={168} strokeWidth={5}>
          <span className="font-mono text-3xl font-semibold text-foreground tabular-nums">
            25:00
          </span>
          <span className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Focus
          </span>
        </TimerRing>

        <div className="text-center">
          <p className="text-[10px] font-medium tracking-wide text-text-dim uppercase">
            Focusing on
          </p>
          <p className="mt-1 max-w-xs truncate text-sm font-medium text-foreground">{objective}</p>
        </div>

        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_CYCLES }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full",
                i < currentCycle ? "bg-accent-cyan" : "border border-border-strong"
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Reset"
            onClick={() => setPhase("ready")}
            className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={phase === "running" ? "Pause" : "Start"}
            onClick={toggleRunning}
            className="flex size-12 items-center justify-center rounded-full bg-accent-cyan text-background transition-transform active:scale-95"
          >
            {phase === "running" ? (
              <Pause className="size-4" fill="currentColor" />
            ) : (
              <Play className="ml-0.5 size-4" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            aria-label="Skip"
            className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <SkipForward className="size-3.5" />
          </button>
        </div>
      </div>
    </Panel>
  );
}
