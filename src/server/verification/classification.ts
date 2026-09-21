import { HermesError } from "@/server/hermes/errors";
import type { Verdict } from "./types";

/**
 * A minimal, deterministic failure taxonomy (Sprint 03 Section 8). This is
 * NOT a retry engine — nothing here retries anything. It exists so a future
 * Planner/Replanner has a real, honest signal to reason about instead of a
 * bare "FAILED" status. Every classifier here returns "UNKNOWN" rather than
 * guessing when the available evidence doesn't clearly support a more
 * specific category — an invented classification is worse than an honest
 * "we don't know."
 */
export type FailureClassification =
  | "TRANSIENT"
  | "PERMANENT"
  | "POLICY_DENIED"
  | "PERMISSION_DENIED"
  | "VERIFICATION_FAILED"
  | "VERIFICATION_UNCERTAIN"
  | "UNKNOWN";

/** A verdict of PASS should never reach a failure classifier — callers only call this once they've already decided the mission failed. */
export function classifyVerificationFailure(verdict: Verdict): FailureClassification {
  if (verdict === "FAIL") return "VERIFICATION_FAILED";
  if (verdict === "UNCERTAIN") return "VERIFICATION_UNCERTAIN";
  return "UNKNOWN";
}

/** `HermesError.retryable` is a real, already-tracked signal (see hermes/errors.ts) — this just names it. Anything not a HermesError is UNKNOWN, not guessed. */
export function classifyHermesError(err: unknown): FailureClassification {
  if (err instanceof HermesError) {
    return err.retryable ? "TRANSIENT" : "PERMANENT";
  }
  return "UNKNOWN";
}

/** A mission/tool-call blocked by security/tool-policy.ts's rule table (DENY), or by a budget constraint — both are governance decisions, not execution errors. */
export function classifyPolicyDenial(): FailureClassification {
  return "POLICY_DENIED";
}

/** A tool blocked because the actor lacked a required credential/approval for this specific call (e.g. a missing/invalid voice-verification token) — distinct from a blanket policy denial. */
export function classifyPermissionDenial(): FailureClassification {
  return "PERMISSION_DENIED";
}
