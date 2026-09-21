import type { RiskLevel } from "@/server/security/types";
import type { VerificationResult, VerificationStrategy } from "@/server/verification/types";

/**
 * The smallest real Tool Registry boundary (JARVIS_PHASE_STATUS.md Phase
 * 04's initial slice). This is a shape, not a framework — it exists so
 * Quick Actions (today's only real tool-executing surface besides Hermes's
 * own tool calls) are represented uniformly instead of each surface
 * inventing its own ad hoc metadata. Do not extend this shape ahead of a
 * second real tool-executing surface that actually needs the extra field.
 */

export type ToolSideEffect = "none" | "local-os" | "filesystem" | "network" | "process-control";

/** How a completed run's success is checked. "self-reported" (the handler's own {ok, message}) or a real observation strategy (Sprint 03) — see `verify` below. */
export type ToolVerificationStrategy = VerificationStrategy;

export interface ToolExecutionResult {
  ok: boolean;
  message: string;
  detail?: string;
}

export interface ToolDefinition {
  id: string;
  description: string;
  risk: RiskLevel;
  /** What this tool does, informationally — Phase 04's future capability/permission model is what will actually consume this. */
  capabilities: string[];
  /** Who may invoke this tool. Only "owner" exists today — there is no multi-actor permission model yet. */
  permission: "owner";
  /** No tool takes structured input today (Quick Actions are zero-argument); a real schema arrives with the first tool that needs one. */
  inputSchema: null;
  sideEffects: ToolSideEffect[];
  verificationStrategy: ToolVerificationStrategy;
  execute(): Promise<ToolExecutionResult>;
  /**
   * Optional real, observation-backed postcondition check — present only
   * for tools with something reliable to observe (Sprint 03 Section 6: "Do
   * NOT require every tool to implement verification"). Absent means
   * `verificationStrategy` is "self-reported": no independent check exists,
   * and `tools/verification.ts`'s `verifyToolOutcome` deliberately returns
   * `null` rather than wrapping the bare self-report in a VerificationResult
   * that would look like real, independent evidence.
   */
  verify?: (result: ToolExecutionResult) => Promise<VerificationResult>;
}
