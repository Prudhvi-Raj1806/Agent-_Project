export interface Actor {
  id: string;
  kind: "user" | "system";
  name: string;
}

export type AuditResult = "allowed" | "denied";

export interface AuditEntry {
  actorId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  result: AuditResult;
  reason?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ToolVerdict = "ALLOW" | "ASK" | "DENY";

export interface ToolPolicyDecision {
  verdict: ToolVerdict;
  risk: RiskLevel;
  reason: string;
}
