import { ArrowRight } from "lucide-react";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import type { AgentActivityStatus, Mission, MissionStatus, StatusTone } from "@/lib/data/types";

const missionToneMap: Record<MissionStatus, StatusTone> = {
  running: "active",
  paused: "idle",
  completed: "success",
  failed: "error",
};

const agentToneMap: Record<AgentActivityStatus, { tone: StatusTone; filled: boolean }> = {
  executing: { tone: "active", filled: true },
  working: { tone: "success", filled: true },
  waiting: { tone: "idle", filled: false },
  idle: { tone: "idle", filled: false },
};

export function MissionCard({ mission, onInspect }: { mission: Mission; onInspect?: () => void }) {
  return (
    <div className="rounded-md border border-border bg-surface-2/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="truncate text-sm font-semibold text-foreground">{mission.name}</h4>
        <StatusIndicator tone={missionToneMap[mission.status]} label={mission.status} />
      </div>

      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="font-mono text-xs text-foreground tabular-nums">
          {mission.progressPercent}%
        </span>
        <ProgressBar percent={mission.progressPercent} variant="flat" className="flex-1" />
      </div>

      <p className="mt-2 text-xs text-foreground">
        <span className="text-text-dim">Objective: </span>
        {mission.objective}
      </p>

      <ul className="mt-1.5 space-y-1">
        {mission.agents.map((agent) => {
          const style = agentToneMap[agent.status];
          return (
            <li key={agent.name} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{agent.name}</span>
              <StatusIndicator tone={style.tone} filled={style.filled} label={agent.status} />
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          <span className="text-text-dim">Next: </span>
          {mission.nextStep}
        </p>
        <button
          type="button"
          onClick={onInspect}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent-cyan transition-colors hover:text-foreground"
        >
          Inspect
          <ArrowRight className="size-3" />
        </button>
      </div>
    </div>
  );
}
