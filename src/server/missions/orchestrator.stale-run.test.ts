import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { subscribe } from "@/server/events/service";
import type { HermesHealth } from "@/server/hermes/contract";
import type { HermesAdapter, HermesExecuteCallbacks, HermesExecuteInput, HermesResult } from "@/server/hermes/types";
import { getOwnerActor } from "@/server/security/policy";
import { pauseMission, resumeMission, startMission } from "./orchestrator";
import { createMission, getMission } from "./service";
import { listMissionTasks } from "./tasks/service";

/**
 * A Hermes adapter whose `execute()` calls are settled manually by the test,
 * in FIFO call order, entirely independent of the `AbortSignal` it's given —
 * modeling an adapter/runtime that does not turn a pause into a prompt
 * rejection (the real mock and HTTP adapters both do, so the pause/resume
 * stale-execution race can never actually be observed against them within a
 * test's timing budget — this fixture is the only way to reproduce it
 * deterministically).
 */
class ControllableHermesAdapter implements HermesAdapter {
  readonly mode = "mock" as const;
  private readonly pendingRuns: Array<Promise<HermesResult>> = [];

  async checkHealth(): Promise<HermesHealth> {
    return { healthy: true, version: "controllable-test-fixture", latencyMs: 0 };
  }

  /** Registers one future `execute()` call; returns the function that settles it whenever the test decides to. */
  queueRun(): (result: HermesResult) => void {
    let resolve!: (result: HermesResult) => void;
    const promise = new Promise<HermesResult>((r) => {
      resolve = r;
    });
    this.pendingRuns.push(promise);
    return resolve;
  }

  async execute(_input: HermesExecuteInput, _callbacks: HermesExecuteCallbacks): Promise<HermesResult> {
    const next = this.pendingRuns.shift();
    if (!next) throw new Error("ControllableHermesAdapter: execute() called with no queued run registered.");
    return next;
  }
}

const adapter = new ControllableHermesAdapter();

vi.mock("@/server/hermes/factory", () => ({
  getHermesAdapter: () => adapter,
}));

function waitForEvent(missionId: string, type: string, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    const unsubscribe = subscribe((event) => {
      if (event.missionId !== missionId || event.type !== type) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

describe("mission orchestrator — pause/resume stale-execution race", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  it("a stale run resolving after resume cannot overwrite the newer run's mission state", async () => {
    const mission = createMission({ objective: "Do a long task" }, getOwnerActor());

    // Run A starts and calls into Hermes; its execute() call is held pending.
    const resolveRunA = adapter.queueRun();
    const runAStarted = waitForEvent(mission.id, "agent.started");
    startMission(mission.id);
    await runAStarted;

    pauseMission(mission.id);
    expect(getMission(mission.id)!.status).toBe("PAUSED");

    // Resume: run B starts, its own execute() call is also held pending.
    const resolveRunB = adapter.queueRun();
    const runBStarted = waitForEvent(mission.id, "agent.started");
    resumeMission(mission.id);
    await runBStarted;
    expect(getMission(mission.id)!.status).toBe("RUNNING");

    // The stale run (A) — paused, superseded, never aborted at the adapter
    // level — resolves successfully now, *while run B is still running*.
    resolveRunA({ success: true, summary: "stale", output: "STALE RUN A OUTPUT", source: "mock" });
    await new Promise((r) => setTimeout(r, 50)); // give its continuation a chance to (incorrectly) run

    const afterStaleResolves = getMission(mission.id)!;
    expect(afterStaleResolves.status).toBe("RUNNING"); // unaffected by run A
    expect(afterStaleResolves.result).toBeNull();
    expect(listMissionTasks(mission.id)[0].status).toBe("running");

    // The real, current run (B) still completes normally.
    const missionCompleted = waitForEvent(mission.id, "mission.completed");
    resolveRunB({ success: true, summary: "real", output: "REAL RUN B OUTPUT", source: "mock" });
    await missionCompleted;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("COMPLETED");
    expect(finished.result?.output).toBe("REAL RUN B OUTPUT");
    expect(listMissionTasks(mission.id)[0].status).toBe("completed");
  });

  it("the current run still transitions normally when nothing is stale", async () => {
    const mission = createMission({ objective: "Do a normal task" }, getOwnerActor());

    const resolveRun = adapter.queueRun();
    const missionCompleted = waitForEvent(mission.id, "mission.completed");
    startMission(mission.id);
    resolveRun({ success: true, summary: "ok", output: "ORDINARY OUTPUT", source: "mock" });
    await missionCompleted;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("COMPLETED");
    expect(finished.result?.output).toBe("ORDINARY OUTPUT");
    expect(listMissionTasks(mission.id)[0].status).toBe("completed");
  });
});
