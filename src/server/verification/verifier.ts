import { nowIso } from "@/server/db/util";
import type { HermesResult } from "@/server/hermes/types";
import type { VerificationResult } from "./types";

export interface VerificationInput {
  successCriteria: string[];
  hermesResult: HermesResult;
}

/**
 * Basic deterministic verifier: "the model returned a response" is never
 * treated as "the mission succeeded" on its own. This intentionally does
 * not do semantic understanding — it's a floor, not a ceiling. Future work:
 * check tool-call results and state changes, not just output text.
 */
export function verify(input: VerificationInput): VerificationResult {
  const { successCriteria, hermesResult } = input;
  const checkedAt = nowIso();

  if (!hermesResult.success) {
    return { verdict: "FAIL", reasons: ["Execution reported failure."], checkedAt };
  }

  if (!hermesResult.output.trim()) {
    return { verdict: "FAIL", reasons: ["Execution produced no output to verify."], checkedAt };
  }

  if (successCriteria.length === 0) {
    return {
      verdict: "UNCERTAIN",
      reasons: [
        "No success criteria were defined for this mission — completing execution is not sufficient evidence of success.",
      ],
      checkedAt,
    };
  }

  const outputLower = hermesResult.output.toLowerCase();
  const missing = successCriteria.filter((criterion) => !outputLower.includes(criterion.toLowerCase()));

  if (missing.length > 0) {
    return {
      verdict: "FAIL",
      reasons: [`Output does not address success criteria: ${missing.join(", ")}`],
      checkedAt,
    };
  }

  return { verdict: "PASS", reasons: ["All declared success criteria are addressed in the output."], checkedAt };
}
