import fs from "node:fs/promises";
import { nowIso } from "@/server/db/util";
import type { VerificationResult } from "@/server/verification/types";
import type { ToolDefinition, ToolExecutionResult } from "./types";

/** A real filesystem observation — cheap, reliable, already used elsewhere in this codebase (e.g. files/service.ts). No new capability, just reused. */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs a tool's own declared postcondition check, if it has one (Sprint 03
 * Section 6/7). Deliberately NOT part of `tools/executor.ts` — ToolExecutor
 * stays the execution boundary only; this is the separate Observation/
 * Verification step, called by whoever cares about the outcome (today:
 * `actions/service.ts`'s `runQuickAction`).
 *
 * Returns `null` for a "self-reported" tool (no `verify` function) rather
 * than fabricating a VerificationResult from the bare `{ok, message}` — a
 * self-report is real information, but wrapping it in the same
 * VerificationResult shape a real observation produces would make it look
 * like independently-established evidence when it isn't. Execution failure
 * (`!result.ok`) always short-circuits to FAIL, regardless of strategy —
 * there is nothing to observe if the tool never got to run.
 */
export async function verifyToolOutcome(tool: ToolDefinition, result: ToolExecutionResult): Promise<VerificationResult | null> {
  if (!tool.verify) return null;
  if (!result.ok) {
    return {
      verdict: "FAIL",
      reasons: ["Execution reported failure — nothing to observe."],
      checkedAt: nowIso(),
      strategy: tool.verificationStrategy,
    };
  }
  return tool.verify(result);
}
