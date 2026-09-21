import { describe, expect, it } from "vitest";
import { executionIdentityKey } from "./execution-identity";

describe("execution identity (Sprint 03 Section 9 — foundation only, no retry logic)", () => {
  it("produces a stable key from a full identity", () => {
    const identity = { missionId: "mission_abc", taskId: "mtask_1", toolCallId: "call-1" };
    expect(executionIdentityKey(identity)).toBe("mission_abc:mtask_1:call-1");
  });

  it("is deterministic — the same identity always produces the same key", () => {
    const identity = { missionId: "mission_abc", taskId: "mtask_1", toolCallId: "call-1" };
    expect(executionIdentityKey(identity)).toBe(executionIdentityKey({ ...identity }));
  });

  it("handles null segments (mission-level identity with no task/tool-call) without colliding with a full identity", () => {
    const missionOnly = executionIdentityKey({ missionId: "mission_abc", taskId: null, toolCallId: null });
    const full = executionIdentityKey({ missionId: "mission_abc", taskId: "mtask_1", toolCallId: "call-1" });
    expect(missionOnly).toBe("mission_abc:-:-");
    expect(missionOnly).not.toBe(full);
  });

  it("different identities never produce the same key", () => {
    const a = executionIdentityKey({ missionId: "mission_a", taskId: "mtask_1", toolCallId: "call-1" });
    const b = executionIdentityKey({ missionId: "mission_b", taskId: "mtask_1", toolCallId: "call-1" });
    const c = executionIdentityKey({ missionId: "mission_a", taskId: "mtask_2", toolCallId: "call-1" });
    const d = executionIdentityKey({ missionId: "mission_a", taskId: "mtask_1", toolCallId: "call-2" });
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});
