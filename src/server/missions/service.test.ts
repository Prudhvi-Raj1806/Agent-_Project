import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/server/db/client";
import { getOwnerActor } from "@/server/security/policy";
import { createMission, getMission, listAllMissions, PolicyError, transitionMission, ValidationError } from "./service";

const actor = getOwnerActor();

describe("mission service", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("creates a mission in QUEUED status and persists it", () => {
    const mission = createMission({ objective: "Research the best architecture for JARVIS" }, actor);
    expect(mission.status).toBe("QUEUED");
    expect(mission.progress).toBe(0);

    const fetched = getMission(mission.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.objective).toBe(mission.objective);
  });

  it("rejects an empty objective", () => {
    expect(() => createMission({ objective: "" }, actor)).toThrow(ValidationError);
  });

  it("rejects contradictory tool policy and records a denied audit entry", () => {
    expect(() =>
      createMission({ objective: "Do a thing", allowedTools: ["terminal"], forbiddenActions: ["terminal"] }, actor)
    ).toThrow(PolicyError);

    const db = getDb();
    const row = db.prepare(`SELECT * FROM audit_events WHERE result = 'denied'`).get() as { action: string } | undefined;
    expect(row?.action).toBe("mission.create");
  });

  it("lists missions newest-first", () => {
    const first = createMission({ objective: "First" }, actor);
    const second = createMission({ objective: "Second" }, actor);
    const all = listAllMissions();
    expect(all.map((m) => m.id)).toEqual([second.id, first.id]);
  });

  it("enforces the state machine on transitions", () => {
    const mission = createMission({ objective: "Test" }, actor);
    expect(() => transitionMission(mission.id, "COMPLETED")).toThrow();
    const running = transitionMission(mission.id, "RUNNING");
    expect(running.status).toBe("RUNNING");
  });
});
