"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MissionCard } from "@/components/work/mission-card";
import { MissionInspector } from "@/components/work/mission-inspector";
import type { Mission } from "@/lib/data/types";
import { useLiveMissions } from "@/lib/work/use-live-missions";

export function ActiveMissionsPanel({ missions: initialMissions }: { missions: Mission[] }) {
  const missions = useLiveMissions(initialMissions);
  const [inspectingId, setInspectingId] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-5">
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-violet text-background">
            <Bot className="size-2.5" strokeWidth={2.5} />
          </span>
          <h3 className="text-sm font-medium text-foreground">Active Missions</h3>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">What JARVIS is working on.</p>
      </div>

      {missions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-xs text-muted-foreground">No active missions.</p>
          <Button variant="outline" size="sm" className="bg-surface-1">
            Create Mission
          </Button>
        </div>
      ) : (
        <div className="no-scrollbar mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
          {missions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onInspect={() => setInspectingId(mission.id)}
            />
          ))}
        </div>
      )}

      <MissionInspector missionId={inspectingId} onClose={() => setInspectingId(null)} />
    </div>
  );
}
