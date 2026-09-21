import { logger } from "@/server/logging/logger";
import { recordAudit } from "@/server/security/audit";
import { getOwnerActor } from "@/server/security/policy";
import { evaluateToolRequest, type ToolPolicyInput } from "@/server/security/tool-policy";
import type { ToolPolicyDecision } from "@/server/security/types";
import { classifyPermissionDenial, classifyPolicyDenial, type FailureClassification } from "@/server/verification/classification";
import { consumeVerificationToken } from "@/server/voice/passcode";
import { getTool } from "./registry";
import type { ToolExecutionResult } from "./types";

export interface ToolExecutionOutcome extends ToolExecutionResult {
  status: number;
  /** Only set on a blocked (non-executed) outcome — see verification/classification.ts. Sprint 03; additive, optional. */
  classification?: FailureClassification;
}

export interface AuditTarget {
  actorId: string;
  resourceType: string;
  resourceId: string;
}

/**
 * Policy evaluation + audit — the one place `security/tool-policy.ts`'s
 * `evaluateToolRequest` is called from, for BOTH tool-executing surfaces in
 * JARVIS:
 *
 *  - Quick Actions (`executeTool`, below): JARVIS executes the tool itself,
 *    via a `ToolDefinition` from the Tool Registry.
 *  - Hermes-mediated tool calls (`missions/orchestrator.ts`'s
 *    `handleToolRequest`): Hermes's own runtime executes the tool, not
 *    JARVIS — Hermes is the intelligence/execution runtime, not the security
 *    boundary (see JARVIS_MASTER_MEMORY.md). JARVIS only decides
 *    ALLOW/ASK/DENY and audits that decision.
 *
 * Both callers used to call `evaluateToolRequest` (and then `recordAudit`)
 * directly and independently; this function is what closes that gap. DENY
 * and ALLOW are audited immediately, here. ASK is returned unaudited — an
 * ASK's eventual approval/denial is a separate step with its own actor (a
 * voice-verification token for Quick Actions, a human resolving a mission's
 * WAITING_USER wait for Hermes) — call `recordToolCallResolution` once that
 * resolves.
 *
 * Sprint 04 (Section 10): if `evaluateToolRequest` itself throws — a
 * malformed request shape, an unexpected internal error, anything — this
 * fails closed to an explicit, audited DENY rather than letting the
 * exception propagate uncaught. Before this, a thrown error happened to
 * still prevent execution (nothing past the throw ever ran), but produced no
 * audit row and no defined verdict for the caller to act on — an accidental
 * side effect of control flow, not a designed fail-closed property. Never
 * caught and turned into an ALLOW.
 */
export function evaluateGovernedToolCall(request: ToolPolicyInput, target: AuditTarget): ToolPolicyDecision {
  let decision: ToolPolicyDecision;
  try {
    decision = evaluateToolRequest(request);
  } catch (err) {
    logger.error("tool.policy.evaluation_failed", {
      toolName: (request as Partial<ToolPolicyInput> | null | undefined)?.toolName,
      error: err instanceof Error ? err.message : String(err),
    });
    decision = {
      verdict: "DENY",
      risk: "critical",
      reason: "Security policy evaluation failed - denying by default (fail-closed).",
    };
  }
  if (decision.verdict !== "ASK") {
    recordAudit({
      actorId: target.actorId,
      action: decision.verdict === "DENY" ? "tool.deny" : "tool.allow",
      resourceType: target.resourceType,
      resourceId: target.resourceId,
      result: decision.verdict === "DENY" ? "denied" : "allowed",
      reason: decision.reason,
    });
  }
  return decision;
}

/** Audits the resolution of a previously-returned ASK verdict (see `evaluateGovernedToolCall`). */
export function recordToolCallResolution(target: AuditTarget, approved: boolean, reason?: string): void {
  recordAudit({
    actorId: target.actorId,
    action: approved ? "tool.allow" : "tool.deny",
    resourceType: target.resourceType,
    resourceId: target.resourceId,
    result: approved ? "allowed" : "denied",
    reason,
  });
}

/**
 * The one execution boundary for any tool in the registry:
 *
 *   Request -> Tool Registry -> Policy -> Permission -> Execution -> Audit
 *
 * `src/server/actions/service.ts`'s `runQuickAction` (and, through it, the
 * Quick Action API route) is a thin wrapper around this — see
 * JARVIS_PHASE_STATUS.md Phase 04. A DENY verdict never reaches
 * `execute()`; an ASK verdict must first be satisfied by a valid
 * voice-verification token (the pre-existing mechanism from
 * `security/tool-policy.ts`'s critical-risk rule) before it does either.
 */
export async function executeTool(id: string, verifyToken: string | null): Promise<ToolExecutionOutcome> {
  const tool = getTool(id);
  if (!tool) return { ok: false, message: "Unknown tool.", status: 404 };

  const target: AuditTarget = { actorId: getOwnerActor().id, resourceType: "tool", resourceId: id };
  const decision = evaluateGovernedToolCall({ toolName: id, allowedTools: [id], forbiddenActions: [] }, target);

  if (decision.verdict === "DENY") {
    logger.warn("tool.execute.blocked", { id, reason: decision.reason });
    return { ok: false, message: decision.reason, status: 403, classification: classifyPolicyDenial() };
  }

  if (decision.verdict === "ASK") {
    if (!consumeVerificationToken(verifyToken)) {
      recordToolCallResolution(target, false, "Missing or invalid voice-verification token.");
      logger.warn("tool.execute.blocked", { id, reason: "missing or invalid verification token" });
      return {
        ok: false,
        message: "This action requires voice verification first.",
        status: 403,
        classification: classifyPermissionDenial(),
      };
    }
    recordToolCallResolution(target, true, "Voice-verification token satisfied the required approval.");
  }

  const result = await tool.execute();
  return { ...result, status: result.ok ? 200 : 500 };
}
