import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { emitEvent, listEventsForMission, subscribe } from "./service";

describe("event system", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("persists an emitted event and returns it in mission history", () => {
    const event = emitEvent({ type: "mission.created", missionId: "mission-1", source: "test", status: "queued" });
    const history = listEventsForMission("mission-1");
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(event.id);
    expect(history[0].type).toBe("mission.created");
  });

  it("publishes to live subscribers synchronously", () => {
    const received: string[] = [];
    const unsubscribe = subscribe((event) => received.push(event.type));

    emitEvent({ type: "mission.started", missionId: "mission-1", source: "test" });
    emitEvent({ type: "mission.progress", missionId: "mission-1", source: "test" });

    unsubscribe();
    emitEvent({ type: "mission.completed", missionId: "mission-1", source: "test" });

    expect(received).toEqual(["mission.started", "mission.progress"]);
  });

  it("keeps missions' event histories separate", () => {
    emitEvent({ type: "mission.created", missionId: "mission-a", source: "test" });
    emitEvent({ type: "mission.created", missionId: "mission-b", source: "test" });

    expect(listEventsForMission("mission-a")).toHaveLength(1);
    expect(listEventsForMission("mission-b")).toHaveLength(1);
  });
});
