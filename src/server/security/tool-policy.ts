import type { RiskLevel, ToolPolicyDecision, ToolVerdict } from "./types";

/**
 * Execution-time tool gate:
 *
 *   Tool request -> Permission check -> Risk evaluation -> ALLOW / ASK / DENY
 *
 * This runs on every tool call a real agent runtime reports wanting to
 * make (see hermes/contract.ts's `tool.requested` frame) — separate from
 * `policy.ts`'s mission-creation-time check. A mission's own
 * `allowedTools`/`forbiddenActions` (declared at creation) act as a scope
 * the owner pre-authorized; risk still puts a floor under it — no tool
 * above "medium" risk is ever auto-allowed, pre-approved or not.
 */

interface ToolRule {
  risk: RiskLevel;
  /** Default verdict absent any mission-specific pre-approval. */
  verdict: ToolVerdict;
}

const DEFAULT_TOOL_RULES: Record<string, ToolRule> = {
  read_file: { risk: "low", verdict: "ALLOW" },
  list_files: { risk: "low", verdict: "ALLOW" },
  search: { risk: "low", verdict: "ALLOW" },
  web_search: { risk: "low", verdict: "ALLOW" },
  write_file: { risk: "medium", verdict: "ASK" },
  http_request: { risk: "medium", verdict: "ASK" },
  delete_file: { risk: "high", verdict: "ASK" },
  send_email: { risk: "high", verdict: "ASK" },
  execute_command: { risk: "critical", verdict: "ASK" },
};

/** Unrecognized tools fail closed: treated as high-risk and never auto-allowed. */
const UNKNOWN_TOOL_RULE: ToolRule = { risk: "high", verdict: "ASK" };

/** Risk levels that are never auto-allowed, even when the tool was pre-approved for this mission. */
const NEVER_AUTO_ALLOW: RiskLevel[] = ["high", "critical"];

export interface ToolPolicyInput {
  toolName: string;
  allowedTools: string[];
  forbiddenActions: string[];
}

export function evaluateToolRequest(input: ToolPolicyInput): ToolPolicyDecision {
  const { toolName, allowedTools, forbiddenActions } = input;
  const rule = DEFAULT_TOOL_RULES[toolName] ?? UNKNOWN_TOOL_RULE;

  if (forbiddenActions.includes(toolName)) {
    return { verdict: "DENY", risk: rule.risk, reason: `"${toolName}" is explicitly forbidden for this mission.` };
  }

  if (rule.risk === "low") {
    return { verdict: "ALLOW", risk: rule.risk, reason: `"${toolName}" is low-risk.` };
  }

  const preApproved = allowedTools.includes(toolName);

  if (preApproved && !NEVER_AUTO_ALLOW.includes(rule.risk)) {
    return {
      verdict: "ALLOW",
      risk: rule.risk,
      reason: `"${toolName}" was pre-approved for this mission and is not high-risk.`,
    };
  }

  if (rule.verdict === "DENY") {
    return { verdict: "DENY", risk: rule.risk, reason: `"${toolName}" is denied by default policy.` };
  }

  return {
    verdict: "ASK",
    risk: rule.risk,
    reason: preApproved
      ? `"${toolName}" is ${rule.risk}-risk and always requires approval, even when pre-approved.`
      : `"${toolName}" (${rule.risk} risk) was not pre-approved for this mission.`,
  };
}
