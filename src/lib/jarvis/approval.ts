import type { RiskLevel } from "@/server/security/types";

const MAX_INPUT_CHARS = 280;

/**
 * What the owner sees as "the thing Jarvis wants to run". A shell command is
 * shown verbatim; anything structured is shown as JSON. Truncation is marked
 * so a clipped command is never mistaken for the whole command.
 */
export function formatApprovalInput(input: unknown): string {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else if (input === undefined || input === null) {
    text = "";
  } else {
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  }
  text = text.trim();
  return text.length > MAX_INPUT_CHARS ? `${text.slice(0, MAX_INPUT_CHARS).trimEnd()}… (truncated)` : text;
}

export const riskLabel: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical risk",
};
