"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/primitives/confirm-dialog";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import type { StatusTone } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import type { Mission as BackendMission } from "@/server/missions/types";
import type { EventType, JarvisEvent } from "@/server/events/types";

/** Every event type the backend can emit — the inspector wants the full timeline, not a curated subset. */
const ALL_EVENT_TYPES: EventType[] = [
  "mission.created",
  "mission.started",
  "mission.paused",
  "mission.resumed",
  "mission.progress",
  "mission.completed",
  "mission.failed",
  "mission.cancelled",
  "agent.started",
  "agent.progress",
  "agent.completed",
  "agent.failed",
  "model.requested",
  "model.selected",
  "model.completed",
  "model.failed",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "verification.started",
  "verification.completed",
  "verification.failed",
  "security.blocked",
  "memory.created",
  "memory.updated",
  "knowledge.updated",
];

const STATUS_TONE: Record<BackendMission["status"], StatusTone> = {
  QUEUED: "idle",
  RUNNING: "active",
  PAUSED: "warning",
  WAITING_USER: "waiting",
  WAITING_EXTERNAL: "waiting",
  BLOCKED: "warning",
  COMPLETED: "success",
  FAILED: "error",
  CANCELLED: "error",
};

const AGENT_TONE: Record<string, StatusTone> = {
  idle: "idle",
  working: "active",
  waiting: "waiting",
  completed: "success",
  failed: "error",
};

const TERMINAL_STATUSES: BackendMission["status"][] = ["COMPLETED", "FAILED", "CANCELLED"];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function describeEvent(event: JarvisEvent): string {
  const meta = event.metadata ?? {};
  const agentName = event.agentId ? capitalize(event.agentId) : "Agent";
  switch (event.type) {
    case "mission.created":
      return "Mission created";
    case "mission.started":
      return "Mission started";
    case "mission.progress":
      return `Progress: ${meta.percent ?? "?"}%${meta.note ? ` — ${meta.note}` : ""}`;
    case "mission.paused":
      return "Mission paused";
    case "mission.resumed":
      return "Mission resumed";
    case "mission.completed":
      return "Mission completed";
    case "mission.failed":
      return `Mission failed${meta.reason ? `: ${meta.reason}` : ""}`;
    case "mission.cancelled":
      return "Mission cancelled";
    case "model.requested":
      return "Requesting model routing";
    case "model.selected":
      return `Routed to ${meta.modelName ?? "?"} (${meta.providerName ?? "?"})`;
    case "model.failed":
      return `Routing failed${meta.reason ? `: ${meta.reason}` : ""}`;
    case "agent.started":
      return `${agentName} started`;
    case "agent.progress":
      return `${agentName} progress${meta.note ? `: ${meta.note}` : ""}`;
    case "agent.completed":
      return `${agentName} completed`;
    case "agent.failed":
      return `${agentName} failed`;
    case "verification.started":
      return "Verification started";
    case "verification.completed":
      return `Verification: ${meta.verdict ?? "?"}`;
    case "verification.failed":
      return "Verification failed";
    case "security.blocked":
      return `Blocked by policy${meta.reason ? `: ${meta.reason}` : ""}`;
    default:
      return event.type;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium tracking-wide text-text-dim uppercase">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function TagList({ items, tone }: { items: string[]; tone?: string }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">None</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground",
            tone
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function MissionInspector({
  missionId,
  onClose,
}: {
  missionId: string | null;
  onClose: () => void;
}) {
  const [mission, setMission] = useState<BackendMission | null>(null);
  const [events, setEvents] = useState<JarvisEvent[]>([]);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const { confirm, dialogProps } = useConfirm();

  // Reset during render (not in an effect) when a new mission is opened.
  if (missionId !== trackedId) {
    setTrackedId(missionId);
    if (missionId) {
      setMission(null);
      setEvents([]);
      setActionError(null);
    }
  }

  useEffect(() => {
    if (!missionId) return;
    let cancelled = false;

    const refetchMission = () => {
      fetch(`/api/missions/${missionId}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setMission(data.mission ?? null);
        })
        .catch(() => {});
    };

    fetch(`/api/missions/${missionId}/events/history`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setEvents(data.events ?? []);
      })
      .catch(() => {});
    refetchMission();

    const source = new EventSource(`/api/missions/${missionId}/events`);
    const handler = (e: MessageEvent) => {
      let event: JarvisEvent;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }
      setEvents((prev) => (prev.some((existing) => existing.id === event.id) ? prev : [...prev, event]));
      refetchMission();
    };
    // The route sends every event with a named `event:` field, so `onmessage`
    // (which only fires for unnamed/"message" events) would never trigger.
    ALL_EVENT_TYPES.forEach((type) => source.addEventListener(type, handler));

    return () => {
      cancelled = true;
      source.close();
    };
  }, [missionId]);

  async function runAction(action: "pause" | "resume" | "cancel") {
    if (!missionId) return;
    setActionPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? `Failed to ${action} mission.`);
        return;
      }
      setMission(data.mission);
    } catch {
      setActionError(`Failed to ${action} mission.`);
    } finally {
      setActionPending(false);
    }
  }

  const routing = [...events].reverse().find((e) => e.type === "model.selected")?.metadata as
    | { providerName?: string; modelName?: string; accountLabel?: string; reason?: string[] }
    | undefined;

  return (
    <>
    <Sheet open={missionId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        {mission ? (
          <>
            <SheetHeader className="shrink-0 border-b border-border">
              <SheetTitle className="pr-8 leading-snug">{mission.objective}</SheetTitle>
              <SheetDescription className="sr-only">Mission inspector</SheetDescription>
              <div className="mt-1 flex items-center gap-3">
                <StatusIndicator tone={STATUS_TONE[mission.status]} label={mission.status} />
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {mission.progress}%
                </span>
              </div>
              <ProgressBar percent={mission.progress} variant="flat" className="mt-1" />
            </SheetHeader>

            <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {routing && (
                <Section title="Model / Provider">
                  <p className="text-xs text-foreground">
                    {routing.modelName} via {routing.providerName}
                    {routing.accountLabel ? ` (${routing.accountLabel})` : ""}
                  </p>
                </Section>
              )}

              {mission.currentObjective && (
                <Section title="Current task">
                  <p className="text-xs text-foreground">{mission.currentObjective}</p>
                </Section>
              )}

              <Section title="Success criteria">
                <TagList items={mission.successCriteria} />
              </Section>

              {mission.constraints.length > 0 && (
                <Section title="Constraints">
                  <TagList items={mission.constraints} />
                </Section>
              )}

              {(mission.allowedTools.length > 0 || mission.forbiddenActions.length > 0) && (
                <Section title="Tool policy">
                  <div className="space-y-1.5">
                    {mission.allowedTools.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <span className="text-text-dim">Allowed: </span>
                        {mission.allowedTools.join(", ")}
                      </p>
                    )}
                    {mission.forbiddenActions.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <span className="text-text-dim">Forbidden: </span>
                        {mission.forbiddenActions.join(", ")}
                      </p>
                    )}
                  </div>
                </Section>
              )}

              <Section title="Agents">
                {mission.agents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not yet assigned</p>
                ) : (
                  <ul className="space-y-1.5">
                    {mission.agents.map((agent) => (
                      <li key={agent.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{agent.role}</span>
                        <StatusIndicator tone={AGENT_TONE[agent.status] ?? "idle"} label={agent.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {mission.risks.length > 0 && (
                <Section title="Risks">
                  <TagList items={mission.risks} />
                </Section>
              )}

              {mission.verification && (
                <Section title="Verification">
                  <div className="flex items-center gap-2">
                    <StatusIndicator
                      tone={
                        mission.verification.verdict === "PASS"
                          ? "success"
                          : mission.verification.verdict === "FAIL"
                            ? "error"
                            : "warning"
                      }
                      label={mission.verification.verdict}
                    />
                  </div>
                  {mission.verification.reasons.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {mission.verification.reasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              <Section title="Timeline">
                <ul className="space-y-2 border-l border-border pl-3">
                  {events.map((event) => (
                    <li key={event.id} className="text-xs">
                      <span className="font-mono text-[10px] text-text-dim tabular-nums">
                        {new Date(event.timestamp).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <p className="text-foreground">{describeEvent(event)}</p>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="Timestamps">
                <dl className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <dt className="text-text-dim">Created</dt>
                    <dd className="text-foreground">{new Date(mission.createdAt).toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-text-dim">Updated</dt>
                    <dd className="text-foreground">{new Date(mission.updatedAt).toLocaleString()}</dd>
                  </div>
                  {mission.completedAt && (
                    <div className="flex justify-between">
                      <dt className="text-text-dim">Completed</dt>
                      <dd className="text-foreground">{new Date(mission.completedAt).toLocaleString()}</dd>
                    </div>
                  )}
                </dl>
              </Section>
            </div>

            <SheetFooter className="shrink-0 border-t border-border">
              {actionError && <p className="text-xs text-status-error">{actionError}</p>}
              {!TERMINAL_STATUSES.includes(mission.status) && (
                <div className="flex items-center gap-2">
                  {mission.status === "RUNNING" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionPending}
                      onClick={() => runAction("pause")}
                    >
                      <Pause className="size-3.5" />
                      Pause
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionPending}
                      onClick={() => runAction("resume")}
                    >
                      <Play className="size-3.5" />
                      Resume
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={actionPending}
                    onClick={() =>
                      confirm({
                        title: "Cancel this mission?",
                        description: "This stops the mission for good — it can't be resumed afterward.",
                        confirmLabel: "Cancel mission",
                        onConfirm: () => runAction("cancel"),
                      })
                    }
                  >
                    <Square className="size-3.5" />
                    Cancel
                  </Button>
                </div>
              )}
            </SheetFooter>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-muted-foreground">Loading mission…</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
    <ConfirmDialog {...dialogProps} />
    </>
  );
}
