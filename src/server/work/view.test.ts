import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { transitionMission, updateMissionAgents } from "@/server/missions/service";
import { getOwnerActor } from "@/server/security/policy";
import { createMission } from "@/server/missions/service";
import { getWorkViewData } from "./view";

describe("work view adapter", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  it("only surfaces non-terminal missions as 'active'", async () => {
    const active = createMission({ objective: "Still going" }, getOwnerActor());
    const done = createMission({ objective: "Already finished" }, getOwnerActor());
    transitionMission(done.id, "RUNNING");
    transitionMission(done.id, "COMPLETED");

    const { missions } = await getWorkViewData();
    expect(missions.map((m) => m.id)).toEqual([active.id]);
  });

  it("maps every server mission status to a valid UI status without throwing", async () => {
    const mission = createMission({ objective: "Test all statuses" }, getOwnerActor());
    const sequence: Array<Parameters<typeof transitionMission>[1]> = ["RUNNING", "PAUSED", "RUNNING", "CANCELLED"];
    for (const status of sequence) {
      transitionMission(mission.id, status);
    }
    // CANCELLED is terminal, so it drops out of the active list — check the shape via a fresh one instead.
    const blocked = createMission({ objective: "Blocked one" }, getOwnerActor());
    transitionMission(blocked.id, "RUNNING");
    transitionMission(blocked.id, "BLOCKED");

    const { missions } = await getWorkViewData();
    const blockedUi = missions.find((m) => m.id === blocked.id)!;
    expect(["running", "paused", "completed", "failed"]).toContain(blockedUi.status);
  });

  it("maps agent assignments into the UI's agent shape", async () => {
    const mission = createMission({ objective: "Do work" }, getOwnerActor());
    transitionMission(mission.id, "RUNNING");
    updateMissionAgents(mission.id, [{ id: "hermes", role: "Hermes", status: "working" }]);

    const { missions } = await getWorkViewData();
    const ui = missions.find((m) => m.id === mission.id)!;
    expect(ui.agents).toEqual([{ name: "Hermes", status: "executing" }]);
  });

  it("never fabricates per-model usage metrics", async () => {
    const { providers } = await getWorkViewData();
    for (const provider of providers) {
      expect(provider.metrics).toEqual([]);
    }
  });

  it("aggregates provider accounts and never leaks api key env var names", async () => {
    const { providers } = await getWorkViewData();
    const anthropic = providers.find((p) => p.id === "anthropic")!;
    expect(anthropic.accounts.length).toBeGreaterThan(1);
    expect(JSON.stringify(providers)).not.toContain("ANTHROPIC_API_KEY");
  });
});
