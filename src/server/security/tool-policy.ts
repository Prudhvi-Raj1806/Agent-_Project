import type { RiskLevel, ToolPolicyDecision, ToolVerdict } from "./types";

/**
 * Execution-time tool gate:
 *
 *   Tool request -> Permission check -> Risk evaluation -> ALLOW / ASK / DENY
 *
 * This is the one execution-time security boundary for anything JARVIS can
 * be asked to run — every tool call a real agent runtime reports wanting to
 * make (see hermes/contract.ts's `tool.requested` frame) AND every Quick
 * Action (see actions/registry.ts and the run route it's wired to). Both
 * callers pass a `toolName` — a Hermes tool name (`read_file`, ...) or a
 * Quick Action id (`open-vscode`, ...); the rule table below covers both
 * namespaces, since neither collides with the other. `allowedTools` is the
 * scope the owner pre-authorized: a mission's own declared list, or — for a
 * directly-invoked Quick Action — the single id the owner just clicked
 * (self-approval by direct invocation). Risk still puts a floor under it —
 * no tool above "medium" risk is ever auto-allowed, pre-approved or not.
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

  // Quick Actions (src/server/actions/registry.ts) — local OS automation the
  // owner triggers directly rather than a Hermes-driven tool call. Each one
  // still goes through this same table: low/ALLOW runs immediately (today's
  // "safe" actions), critical/ASK requires the existing voice-passcode token
  // before it may run (today's one "risky" action).
  "open-vscode": { risk: "low", verdict: "ALLOW" },
  "take-notes": { risk: "low", verdict: "ALLOW" },
  "take-screenshot": { risk: "low", verdict: "ALLOW" },
  "open-obsidian": { risk: "low", verdict: "ALLOW" },
  "summarize-clipboard": { risk: "low", verdict: "ALLOW" },
  "welcome-routine": { risk: "low", verdict: "ALLOW" },
  "control-computer": { risk: "critical", verdict: "ASK" },
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
    return { verdict: "DENY", risk: rule.risk, reason: `"${toolName}" is explicitly forbidden.` };
  }

  if (rule.risk === "low") {
    return { verdict: "ALLOW", risk: rule.risk, reason: `"${toolName}" is low-risk.` };
  }

  const preApproved = allowedTools.includes(toolName);

  if (preApproved && !NEVER_AUTO_ALLOW.includes(rule.risk)) {
    return {
      verdict: "ALLOW",
      risk: rule.risk,
      reason: `"${toolName}" was pre-approved and is not high-risk.`,
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
      : `"${toolName}" (${rule.risk} risk) was not pre-approved.`,
  };
}
