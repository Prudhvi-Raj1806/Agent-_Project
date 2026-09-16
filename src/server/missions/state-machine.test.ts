import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, InvalidTransitionError } from "./state-machine";

describe("mission state machine", () => {
  it("allows QUEUED -> RUNNING", () => {
    expect(canTransition("QUEUED", "RUNNING")).toBe(true);
  });

  it("allows RUNNING -> PAUSED -> RUNNING", () => {
    expect(canTransition("RUNNING", "PAUSED")).toBe(true);
    expect(canTransition("PAUSED", "RUNNING")).toBe(true);
  });

  it("rejects QUEUED -> COMPLETED (cannot skip execution)", () => {
    expect(canTransition("QUEUED", "COMPLETED")).toBe(false);
    expect(() => assertTransition("QUEUED", "COMPLETED")).toThrow(InvalidTransitionError);
  });

  it("treats terminal states as dead ends", () => {
    expect(canTransition("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransition("FAILED", "RUNNING")).toBe(false);
    expect(canTransition("CANCELLED", "RUNNING")).toBe(false);
  });

  it("allows cancellation from every non-terminal state", () => {
    for (const from of ["QUEUED", "RUNNING", "PAUSED", "WAITING_USER", "WAITING_EXTERNAL", "BLOCKED"] as const) {
      expect(canTransition(from, "CANCELLED")).toBe(true);
    }
  });
});
