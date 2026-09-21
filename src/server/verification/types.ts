export type Verdict = "PASS" | "FAIL" | "UNCERTAIN";

/**
 * How a verdict was established — so a result is never just an opaque
 * PASS/FAIL/UNCERTAIN with no record of what kind of check produced it.
 *   "text-match"    — the pre-existing deterministic substring verifier.
 *   "self-reported" — a tool's own {ok, message}, with no independent
 *                      observation behind it (see JARVIS_MASTER_MEMORY.md's
 *                      execution-vs-verification distinction).
 *   "file-exists"   — a real filesystem observation (Sprint 03).
 */
export type VerificationStrategy = "text-match" | "self-reported" | "file-exists";

export interface VerificationResult {
  verdict: Verdict;
  reasons: string[];
  checkedAt: string;
  /** Optional so every pre-Sprint-03 call site remains valid; new code should always set it. */
  strategy?: VerificationStrategy;
}
