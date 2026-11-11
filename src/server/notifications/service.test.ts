import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { emitEvent } from "@/server/events/service";
import { listNotifications } from "./service";

describe("notifications", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("lists the outcomes worth telling the owner about, newest first", () => {
    emitEvent({ type: "mission.completed", missionId: "m1", source: "orchestrator" });
    emitEvent({ type: "mission.failed", missionId: "m2", source: "orchestrator" });

    expect(listNotifications().map((n) => n.message)).toEqual(["Mission failed: m2", "Mission completed: m1"]);
  });

  it("ignores events that are not outcomes", () => {
    emitEvent({ type: "mission.progress", missionId: "m1", source: "orchestrator" });
    emitEvent({ type: "brain.routed", source: "brain", metadata: { choice: "time.read" } });
    expect(listNotifications()).toEqual([]);
  });

  it("still shows a mission outcome after a long run of chatter that is not one", () => {
    emitEvent({ type: "mission.failed", missionId: "m1", source: "orchestrator" });
    // 300 later events, as a busy session of mini-brain requests or a long mission produces.
    for (let i = 0; i < 300; i += 1) emitEvent({ type: "brain.routed", source: "brain", metadata: { i } });

    expect(listNotifications().map((n) => n.message)).toEqual(["Mission failed: m1"]);
  });

  it("returns at most the limit, keeping the newest", () => {
    for (let i = 0; i < 5; i += 1) emitEvent({ type: "mission.completed", missionId: `m${i}`, source: "orchestrator" });
    const shown = listNotifications(2);
    expect(shown).toHaveLength(2);
    expect(shown[0].message).toBe("Mission completed: m4");
  });
});
