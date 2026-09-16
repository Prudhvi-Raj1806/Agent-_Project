import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { listEventsForMission, subscribe } from "@/server/events/service";
import { getOwnerActor } from "@/server/security/policy";
import { startMission } from "./orchestrator";
import { createMission, getMission } from "./service";

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
  });

  it("fails the mission (not silently) when no provider is available", async () => {
    const mission = createMission({ objective: "Do something" }, getOwnerActor());

    const done = waitForMissionTerminal(mission.id);
    startMission(mission.id);
    await done;

    expect(getMission(mission.id)!.status).toBe("FAILED");
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

    const cancelled = cancelMission(mission.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(() => cancelMission(mission.id)).toThrow(); // already terminal
  });
});
