import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { listEventsForMission, subscribe } from "@/server/events/service";
import { getOwnerActor } from "@/server/security/policy";
import { listMissionCheckpoints } from "./checkpoints/service";
import { startMission } from "./orchestrator";
import { createMission, getMission } from "./service";
import { listMissionTasks } from "./tasks/service";

function waitForMissionTerminal(missionId: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for mission to finish.")), timeoutMs);
    const unsubscribe = subscribe((event) => {
      if (event.missionId !== missionId) return;
      if (event.type === "mission.completed" || event.type === "mission.failed") {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}

describe("mission orchestrator (end-to-end vertical slice)", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
    vi.unstubAllEnvs();
  });

  it("runs request -> mission -> routing -> hermes -> verification -> completion", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");

    const mission = createMission(
      { objective: "Research the best architecture for JARVIS", successCriteria: ["architecture"] },
      getOwnerActor()
    );

    const done = waitForMissionTerminal(mission.id);
    startMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("COMPLETED");
    expect(finished.progress).toBe(100);
    expect(finished.result?.source).toBe("mock");
    expect(finished.verification?.verdict).toBe("PASS");

    const tasks = listMissionTasks(mission.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe(mission.objective);
    expect(tasks[0].status).toBe("completed");
  });

  it("fails the mission (not silently) when no provider is available", async () => {
    const mission = createMission({ objective: "Do something" }, getOwnerActor());

    const done = waitForMissionTerminal(mission.id);
    startMission(mission.id);
    await done;

    expect(getMission(mission.id)!.status).toBe("FAILED");
    expect(listMissionTasks(mission.id)[0].status).toBe("failed");
  });

  it("Sprint 03: execution success + declared criteria the output never satisfies = FAILED, not COMPLETED — never confuses 'Hermes responded' with 'the criteria were met'", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const mission = createMission(
      { objective: "Do the thing", successCriteria: ["a-keyword-the-mock-output-will-never-contain"] },
      getOwnerActor()
    );

    const done = waitForMissionTerminal(mission.id);
    startMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("FAILED");
    expect(finished.verification?.verdict).toBe("FAIL");
    expect(finished.result).not.toBeNull(); // the real Hermes result is preserved even though the mission failed

    const events = listEventsForMission(mission.id);
    const failedEvent = events.find((e) => e.type === "mission.failed")!;
    expect(failedEvent.metadata).toMatchObject({ classification: "VERIFICATION_FAILED", hasSuccessCriteria: true });
  });

  it("fails the mission (not silently) when it exceeds its step budget", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    // The mock adapter reports exactly 3 progress steps; a budget of 2 must
    // stop it on the 3rd, before it ever reaches 100%.
    const mission = createMission(
      { objective: "Do a long multi-step task", budget: { maxSteps: 2 } },
      getOwnerActor()
    );

    const done = waitForMissionTerminal(mission.id);
    startMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("FAILED");
    expect(finished.progress).toBeLessThan(100);

    const events = listEventsForMission(mission.id);
    const types = events.map((e) => e.type);
    expect(types).toContain("mission.budget_exceeded");
    expect(types).toContain("mission.failed");

    // Sprint 03: a budget violation is a governance constraint, not an execution error.
    const failedEvent = events.find((e) => e.type === "mission.failed")!;
    expect(failedEvent.metadata).toMatchObject({ classification: "POLICY_DENIED" });

    expect(listMissionTasks(mission.id)[0].status).toBe("failed");
  });

  it("emits the full operational event sequence, persisted to history", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const mission = createMission({ objective: "Implement a feature" }, getOwnerActor());

    const done = waitForMissionTerminal(mission.id);
    startMission(mission.id);
    await done;

    const types = listEventsForMission(mission.id).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "mission.created",
        "mission.started",
        "model.requested",
        "model.selected",
        "agent.started",
        "agent.progress",
        "agent.completed",
        "verification.started",
        "verification.completed",
        "mission.completed",
      ])
    );
  });

  it("pause() stops execution and cancel() is terminal", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const { pauseMission, cancelMission } = await import("./orchestrator");

    const mission = createMission({ objective: "Implement a feature" }, getOwnerActor());
    startMission(mission.id);

    // Give the pipeline a moment to reach the hermes execution phase.
    await new Promise((r) => setTimeout(r, 50));

    const paused = pauseMission(mission.id);
    expect(paused.status).toBe("PAUSED");
    expect(listMissionTasks(mission.id)[0].status).toBe("blocked");

    const checkpoints = listMissionCheckpoints(mission.id);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].label).toBe("paused");
    expect(checkpoints[0].state).toMatchObject({ status: "PAUSED" });
    // Sprint 03: checkpoint state carries recovery-relevant verification context.
    expect(checkpoints[0].state).toHaveProperty("verification");
    expect(checkpoints[0].state.executionIdentity).toBe(`${mission.id}:-:-`);

    const cancelled = cancelMission(mission.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(listMissionTasks(mission.id)[0].status).toBe("cancelled");
    expect(() => cancelMission(mission.id)).toThrow(); // already terminal
  });

  it("resume() reactivates the root task instead of duplicating it", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const { pauseMission, resumeMission } = await import("./orchestrator");

    const mission = createMission({ objective: "Implement a feature" }, getOwnerActor());
    startMission(mission.id);

    // Give the pipeline a moment to reach the hermes execution phase.
    await new Promise((r) => setTimeout(r, 50));
    pauseMission(mission.id);

    let tasks = listMissionTasks(mission.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("blocked");

    const done = waitForMissionTerminal(mission.id);
    resumeMission(mission.id);
    await done;

    tasks = listMissionTasks(mission.id);
    expect(tasks).toHaveLength(1); // still exactly one task -- resume must not insert a duplicate
    expect(tasks[0].status).toBe("completed");
  });
});
