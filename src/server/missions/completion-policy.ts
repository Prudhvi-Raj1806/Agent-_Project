import type { VerificationResult } from "@/server/verification/types";

export type MissionCompletionOutcome = "COMPLETED" | "FAILED";

/**
 * The one place that decides whether a finished mission's execution +
 * verification adds up to a verified success or not (Sprint 03 Section 3 /
 * 11). Hermes reporting execution success is necessary but never
 * sufficient — see verify()'s own floor in verification/verifier.ts.
 *
 *   verdict PASS                              -> COMPLETED (verified success)
 *   verdict FAIL                              -> FAILED
 *   verdict UNCERTAIN, criteria were declared -> FAILED. Verification was
 *     explicitly requested (the mission declared success criteria) and came
 *     back inconclusive — that must not be treated the same as an actual
 *     PASS. Classified as VERIFICATION_UNCERTAIN, not VERIFICATION_FAILED,
 *     by the caller (see verification/classification.ts) — the mission
 *     status is coarser than the verdict on purpose; the real distinction
 *     survives in the stored VerificationResult and the classification.
 *   verdict UNCERTAIN, no criteria declared   -> COMPLETED. The one
 *     deliberate, documented exception: a mission that never declared
 *     anything to verify against never asked to be held to a verified-
 *     success bar in the first place, so there is nothing it failed to
 *     verify. Preserves the pre-Sprint-03 behavior for missions with no
 *     verifiable postcondition (JARVIS_PHASE_STATUS.md Phase 06) — Sprint
 *     03 explicitly does not force verification onto missions that never
 *     asked for it.
 */
export function decideMissionCompletion(verdict: VerificationResult, hasSuccessCriteria: boolean): MissionCompletionOutcome {
  if (verdict.verdict === "FAIL") return "FAILED";
  if (verdict.verdict === "UNCERTAIN" && hasSuccessCriteria) return "FAILED";
  return "COMPLETED";
}
