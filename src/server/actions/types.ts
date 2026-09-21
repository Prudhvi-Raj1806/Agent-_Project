import type { VerificationResult, VerificationStrategy } from "@/server/verification/types";

export type ActionRisk = "safe" | "risky";

export interface ActionRunResult {
  ok: boolean;
  message: string;
  detail?: string;
}

export interface ActionDefinition {
  id: string;
  label: string;
  risk: ActionRisk;
  run: () => Promise<ActionRunResult>;
  /** Defaults to "self-reported" when omitted (see tools/registry.ts). Sprint 03. */
  verificationStrategy?: VerificationStrategy;
  /** A real, observation-backed postcondition check — only present for actions with something reliable to observe (e.g. a file write). Sprint 03. */
  verify?: (result: ActionRunResult) => Promise<VerificationResult>;
}

/** Public-safe projection — no `run` handler leaves the server. */
export interface ActionSummary {
  id: string;
  label: string;
  risk: ActionRisk;
}
