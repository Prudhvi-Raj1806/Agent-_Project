import { describe, expect, it } from "vitest";
import { isSettledStatus, missionSpeech } from "./mission-speech";
import type { Mission } from "@/server/missions/types";

function mission(overrides: Partial<Mission>): Mission {
  return {
    id: "m1",
    objective: "do the thing",
    successCriteria: [],
    constraints: [],
    forbiddenActions: [],
    allowedTools: [],
    budget: null,
    deadline: null,
    status: "COMPLETED",
    progress: 100,
    currentObjective: null,
    agents: [],
    risks: [],
    unknowns: [],
    assumptions: [],
    checkpoints: [],
    result: { success: true, summary: "Your inbox has three new messages.", output: "", source: "hermes" },
    verification: null,
    pendingToolApproval: null,
    decision: null,
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("isSettledStatus", () => {
  it("is false while work is still going and true once it needs attention or ended", () => {
    expect(isSettledStatus("QUEUED")).toBe(false);
    expect(isSettledStatus("RUNNING")).toBe(false);
    for (const s of ["COMPLETED", "FAILED", "CANCELLED", "BLOCKED", "WAITING_USER", "WAITING_EXTERNAL", "PAUSED"] as const) {
      expect(isSettledStatus(s)).toBe(true);
    }
  });
});

describe("missionSpeech", () => {
  it("speaks the result summary for a verified completion", () => {
    const text = missionSpeech(
      mission({ verification: { verdict: "PASS", reasons: [], checkedAt: "x" } }),
    );
    expect(text).toBe("Your inbox has three new messages.");
  });

  it("speaks what the agent produced, not its generic status line", () => {
    const text = missionSpeech(
      mission({
        result: { success: true, summary: "Hermes Agent run completed", output: "Two plus two is four.", source: "hermes" },
        verification: { verdict: "UNCERTAIN", reasons: [], checkedAt: "x" },
      }),
    );
    expect(text).toBe("Two plus two is four. I couldn't independently verify that.");
    expect(text).not.toContain("Hermes Agent run completed");
  });

  it("does not present an unverified result as confirmed", () => {
    const text = missionSpeech(
      mission({ verification: { verdict: "UNCERTAIN", reasons: [], checkedAt: "x" } }),
    );
    expect(text).toContain("Your inbox has three new messages.");
    expect(text).toContain("couldn't independently verify");
  });

  it("reports a failed verification instead of the optimistic summary", () => {
    const text = missionSpeech(
      mission({ verification: { verdict: "FAIL", reasons: ["The file was never created."], checkedAt: "x" } }),
    );
    expect(text).toContain("verification failed");
    expect(text).toContain("The file was never created.");
    expect(text).not.toContain("three new messages");
  });

  it("says plainly when the run was simulated", () => {
    const text = missionSpeech(mission({ result: { success: true, summary: "Done.", output: "", source: "mock" } }));
    expect(text).toContain("simulated");
  });

  it("asks for approval by tool name when waiting on the user", () => {
    const text = missionSpeech(
      mission({
        status: "WAITING_USER",
        result: null,
        pendingToolApproval: {
          toolCallId: "t",
          toolName: "terminal",
          input: {},
          risk: "high",
          reason: "r",
          requestedAt: "x",
        },
      }),
    );
    expect(text).toContain("approval");
    expect(text).toContain("terminal");
  });

  it("covers failed, blocked, cancelled and empty-result cases without inventing detail", () => {
    expect(missionSpeech(mission({ status: "FAILED", result: null }))).toContain("failed");
    expect(missionSpeech(mission({ status: "BLOCKED", result: null }))).toContain("blocked");
    expect(missionSpeech(mission({ status: "CANCELLED", result: null }))).toContain("cancelled");
    expect(missionSpeech(mission({ result: null }))).toContain("nothing to report");
  });

  it("keeps long results to a speakable length, ending on a sentence", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const text = missionSpeech(mission({ result: { success: true, summary: long, output: "", source: "hermes" } }));
    expect(text.length).toBeLessThanOrEqual(430);
    expect(text.endsWith(".")).toBe(true);
  });
});
