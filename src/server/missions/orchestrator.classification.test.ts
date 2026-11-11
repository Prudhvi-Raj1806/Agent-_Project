import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { listEventsForMission, subscribe } from "@/server/events/service";
import type { DecisionModelAdapter } from "@/server/laya/types";
import { getOwnerActor } from "@/server/security/policy";
import { createMission, getMission } from "./service";

/**
 * Laya's pre-classification of a mission. Two earlier versions of this existed
 * side by side (one awaited the call before the mission started and persisted the
 * result; one fired it and forgot, never persisting). The merged behaviour is the
 * persistence of the first with the non-blocking guarantee of the second.
 */
const classify = vi.hoisted(() => vi.fn());
vi.mock("@/server/laya/factory", () => ({
  getDecisionModelAdapter: (): DecisionModelAdapter => ({
    mode: "fallback",
    classify,
    health: async () => ({ status: "degraded" }),
  }),
}));

import { startMission } from "./orchestrator";

function waitForMissionTerminal(missionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for mission to finish.")), 5000);
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

describe("mission classification by Laya", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
    vi.unstubAllEnvs();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    classify.mockReset();
  });

  async function run(objective: string): Promise<string> {
    const mission = createMission({ objective }, getOwnerActor());
    const done = waitForMissionTerminal(mission.id);
    startMission(mission.id);
    await done;
    // The classification is fire-and-forget; give its promise a turn to settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    return mission.id;
  }

  it("records the decision on the mission and announces it once", async () => {
    classify.mockResolvedValue({ decision: "unattended", confidence: 0.9 });

    const id = await run("Research the best architecture for JARVIS");

    expect(getMission(id)!.decision).toEqual({ choice: "unattended", confidence: 0.9 });
    const announced = listEventsForMission(id).filter((e) => e.type === "mission.classified");
    expect(announced).toHaveLength(1);
    expect(announced[0].metadata).toMatchObject({ decision: "unattended", confidence: 0.9 });
    expect(classify).toHaveBeenCalledOnce();
    expect(classify.mock.calls[0][0]).toMatchObject({
      state: "Research the best architecture for JARVIS",
      schema: ["unattended", "needs_planning"],
    });
  });

  it("records an honest 'unknown' at zero confidence from the fallback, not a guessed option", async () => {
    classify.mockResolvedValue({ decision: "unknown", confidence: 0 });
    const id = await run("Do something");
    expect(getMission(id)!.decision).toEqual({ choice: "unknown", confidence: 0 });
  });

  it("never blocks or fails the mission when Laya errors", async () => {
    classify.mockRejectedValue(new Error("Laya is down"));

    const id = await run("Research the best architecture for JARVIS");

    expect(getMission(id)!.status).toBe("COMPLETED");
    expect(getMission(id)!.decision).toBeNull();
    expect(listEventsForMission(id).some((e) => e.type === "mission.classified")).toBe(false);
  });

  it("does not hold the mission back while Laya is slow", async () => {
    classify.mockReturnValue(new Promise(() => {})); // never answers

    const id = await run("Research the best architecture for JARVIS");

    expect(getMission(id)!.status).toBe("COMPLETED");
    expect(getMission(id)!.decision).toBeNull();
  });
});
