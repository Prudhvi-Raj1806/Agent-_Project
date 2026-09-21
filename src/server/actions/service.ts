import { logger } from "@/server/logging/logger";
import { getTool } from "@/server/tools/registry";
import { executeTool } from "@/server/tools/executor";
import { verifyToolOutcome } from "@/server/tools/verification";
import type { VerificationResult } from "@/server/verification/types";
import type { ActionRunResult } from "./types";

export interface QuickActionOutcome extends ActionRunResult {
  status: number;
  /** Set only when the tool declares a real, observation-backed postcondition (Sprint 03) — see tools/verification.ts. */
  verification?: VerificationResult;
}

/**
 * Quick Actions are registered as tools (src/server/tools/registry.ts,
 * built from `ACTION_REGISTRY`) and run through the Tool Registry's one
 * execution boundary (src/server/tools/executor.ts): Request -> Tool
 * Registry -> Policy -> Permission -> Execution -> Audit. This function is
 * a thin, Quick-Action-flavored wrapper around `executeTool` — the API
 * route (src/app/api/actions/[id]/run/route.ts) delegates to it rather than
 * holding logic itself, matching how other API routes call into a
 * `src/server/*` service.
 *
 * Sprint 03: after execution, separately runs the tool's own observation-
 * backed verification, if it has one — deliberately outside `executeTool`
 * (ToolExecutor stays execution-only). Skipped entirely when the tool was
 * blocked before ever running (404 unknown / 403 denied) — there is nothing
 * to observe if execution never happened.
 */
export async function runQuickAction(id: string, verifyToken: string | null): Promise<QuickActionOutcome> {
  const outcome = await executeTool(id, verifyToken);
  if (outcome.status === 404 || outcome.status === 403) return outcome;

  const tool = getTool(id);
  if (!tool) return outcome;

  const verification = await verifyToolOutcome(tool, outcome);
  if (verification) {
    logger.info("action.verify", { id, verdict: verification.verdict, strategy: verification.strategy });
    return { ...outcome, verification };
  }
  return outcome;
}
