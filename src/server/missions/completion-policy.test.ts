import { describe, expect, it } from "vitest";
import type { VerificationResult } from "@/server/verification/types";
import { decideMissionCompletion } from "./completion-policy";

function verdict(v: VerificationResult["verdict"]): VerificationResult {
  return { verdict: v, reasons: ["test"], checkedAt: "2026-01-01T00:00:00.000Z", strategy: "text-match" };
}

/**
 * Directly tests the mission-completion DECISION logic (Sprint 03 Section
 * 3/11/14) with constructed VerificationResult inputs — the most precise
 * way to prove the rule holds, independent of whether the current
 * text-match verifier can organically produce every input combination
 * (e.g. UNCERTAIN with criteria declared isn't reachable via plain
 * substring matching today, but the decision function must still handle it
 * correctly for when a future verification strategy can produce it).
 */
describe("decideMissionCompletion (Sprint 03 — execution success is never treated as verified success on its own)", () => {
  it("PASS -> COMPLETED: verified success", () => {
    expect(decideMissionCompletion(verdict("PASS"), true)).toBe("COMPLETED");
  });

  it("FAIL -> FAILED, regardless of whether criteria were declared", () => {
    expect(decideMissionCompletion(verdict("FAIL"), true)).toBe("FAILED");
    expect(decideMissionCompletion(verdict("FAIL"), false)).toBe("FAILED");
  });

  it("UNCERTAIN with criteria declared -> FAILED, not COMPLETED: verification was explicitly requested and came back inconclusive", () => {
    expect(decideMissionCompletion(verdict("UNCERTAIN"), true)).toBe("FAILED");
  });

  it("UNCERTAIN with no criteria declared -> COMPLETED: the one documented exception — nothing was ever asked to be verified", () => {
    expect(decideMissionCompletion(verdict("UNCERTAIN"), false)).toBe("COMPLETED");
  });

  it("UNCERTAIN never silently becomes PASS in either case — it is either FAILED or an explicitly-exempted COMPLETED, never treated as if the verifier said PASS", () => {
    const withCriteria = decideMissionCompletion(verdict("UNCERTAIN"), true);
    const withoutCriteria = decideMissionCompletion(verdict("UNCERTAIN"), false);
    expect(withCriteria).not.toBe("COMPLETED");
    // Even the exempted case is "COMPLETED" for a documented reason (no
    // verification was requested), not because UNCERTAIN was reinterpreted
    // as PASS — the stored VerificationResult still says UNCERTAIN, not PASS.
    expect(withoutCriteria).toBe("COMPLETED");
    expect(verdict("UNCERTAIN").verdict).not.toBe("PASS");
  });
});
