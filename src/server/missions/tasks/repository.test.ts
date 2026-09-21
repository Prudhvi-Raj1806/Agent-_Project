import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { newId, nowIso } from "@/server/db/util";
import { getOwnerActor } from "@/server/security/policy";
import { createMission } from "../service";
import { getMissionTaskById, insertMissionTask, listMissionTasksByMission, updateMissionTask } from "./repository";
import type { MissionTask } from "./types";

function buildTask(missionId: string, overrides: Partial<MissionTask> = {}): MissionTask {
  const now = nowIso();
  return {
    id: newId("mtask"),
    missionId,
    parentId: null,
    title: "Root objective",
    status: "running",
    sequence: 0,
    dependsOn: [],
    result: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("mission_tasks repository", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("round-trips every field, including JSON columns", () => {
    const mission = createMission({ objective: "Ship the thing" }, getOwnerActor());
    const task = buildTask(mission.id, { parentId: null, dependsOn: [], result: null });

    insertMissionTask(task);
    const fetched = getMissionTaskById(task.id);

    expect(fetched).toEqual(task);
  });

  it("returns an empty list for a mission with no tasks", () => {
    expect(listMissionTasksByMission("mission_does-not-exist")).toEqual([]);
  });

  it("orders tasks by sequence, not insertion order", () => {
    const mission = createMission({ objective: "Ship the thing" }, getOwnerActor());
    const second = buildTask(mission.id, { title: "Second", sequence: 1 });
    const first = buildTask(mission.id, { title: "First", sequence: 0 });

    insertMissionTask(second);
    insertMissionTask(first);

    const tasks = listMissionTasksByMission(mission.id);
    expect(tasks.map((t) => t.title)).toEqual(["First", "Second"]);
  });

  it("persists updates made via updateMissionTask", () => {
    const mission = createMission({ objective: "Ship the thing" }, getOwnerActor());
    const task = buildTask(mission.id);
    insertMissionTask(task);

    const result = { success: true, summary: "Done", output: "done", source: "mock" as const };
    const updated: MissionTask = {
      ...task,
      status: "completed",
      result,
      updatedAt: nowIso(),
    };
    updateMissionTask(updated);

    const fetched = getMissionTaskById(task.id)!;
    expect(fetched.status).toBe("completed");
    expect(fetched.result).toEqual(result);
  });
});
