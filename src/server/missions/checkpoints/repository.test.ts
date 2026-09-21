import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { newId, nowIso } from "@/server/db/util";
import { getOwnerActor } from "@/server/security/policy";
import { createMission } from "../service";
import { insertMissionCheckpoint, listMissionCheckpointsByMission } from "./repository";
import type { MissionCheckpoint } from "./types";

function buildCheckpoint(missionId: string, overrides: Partial<MissionCheckpoint> = {}): MissionCheckpoint {
  return {
    id: newId("chk"),
    missionId,
    label: "paused",
    state: { status: "PAUSED", progress: 40 },
    createdAt: nowIso(),
    ...overrides,
  };
}

describe("checkpoints repository", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("round-trips every field, including the JSON state column", () => {
    const mission = createMission({ objective: "Ship the thing" }, getOwnerActor());
    const checkpoint = buildCheckpoint(mission.id, { state: { status: "PAUSED", progress: 40, agents: [{ id: "hermes", role: "Hermes", status: "waiting" }] } });

    insertMissionCheckpoint(checkpoint);
    const [fetched] = listMissionCheckpointsByMission(mission.id);

    expect(fetched).toEqual(checkpoint);
  });

  it("returns an empty list for a mission with no checkpoints", () => {
    expect(listMissionCheckpointsByMission("mission_does-not-exist")).toEqual([]);
  });

  it("orders checkpoints chronologically", () => {
    const mission = createMission({ objective: "Ship the thing" }, getOwnerActor());
    const first = buildCheckpoint(mission.id, { label: "first", createdAt: "2026-01-01T00:00:00.000Z" });
    const second = buildCheckpoint(mission.id, { label: "second", createdAt: "2026-01-01T00:01:00.000Z" });

    insertMissionCheckpoint(second);
    insertMissionCheckpoint(first);

    const checkpoints = listMissionCheckpointsByMission(mission.id);
    expect(checkpoints.map((c) => c.label)).toEqual(["first", "second"]);
  });
});
