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
}

/** Public-safe projection — no `run` handler leaves the server. */
export interface ActionSummary {
  id: string;
  label: string;
  risk: ActionRisk;
}
