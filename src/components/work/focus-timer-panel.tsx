"use client";

import { useState } from "react";
import { ChevronDown, Pause, Play, RotateCcw, Square } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import { TimerRing } from "@/components/primitives/timer-ring";

const modes = ["Pomodoro", "Deep Work", "Short Break"] as const;

export function FocusTimerPanel({ className }: { className?: string }) {
  const [mode, setMode] = useState<(typeof modes)[number]>("Pomodoro");
  const [isRunning, setIsRunning] = useState(false);

  return (
    <Panel className={className}>
      <PanelHeader
        title="Focus Timer"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
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
        }
      />
      <PanelBody className="flex items-center justify-center gap-5 py-2">
        <TimerRing size={84} strokeWidth={4}>
          <span className="font-mono text-base font-semibold text-foreground tabular-nums">
            25:00
          </span>
          <span className="text-[10px] text-muted-foreground">Focus</span>
        </TimerRing>

        <div className="flex shrink-0 flex-col items-center gap-2.5">
          <button
            type="button"
            aria-label={isRunning ? "Pause" : "Start"}
            onClick={() => setIsRunning((r) => !r)}
            className="flex size-9 items-center justify-center rounded-full bg-accent-cyan text-background transition-transform active:scale-95"
          >
            {isRunning ? (
              <Pause className="size-4" fill="currentColor" />
            ) : (
              <Play className="ml-0.5 size-4" fill="currentColor" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Reset"
              className="flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-3" />
            </button>
            <button
              type="button"
              aria-label="Stop"
              className="flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <Square className="size-2.5" />
            </button>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}
