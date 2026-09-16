import type { Actor, PolicyDecision } from "./types";

/**
 * Security control plane. Deliberately independent of the mission domain
 * types (takes structural shapes instead) so it can be imported by any
 * server module without creating a dependency cycle back to missions.
 */

export function getOwnerActor(): Actor {
  return { id: "owner", kind: "user", name: process.env.JARVIS_OWNER_NAME ?? "Raj" };
}

export function getSystemActor(): Actor {
  return { id: "system", kind: "system", name: "JARVIS" };
}

export interface MissionPolicyInput {
  objective: string;
  allowedTools?: string[];
  forbiddenActions?: string[];
}

/**
 * Phase-1 policy check for mission creation: reject contradictory tool
 * policy up front rather than discovering it mid-execution. Real tool-level
 * permission enforcement (checking each tool call against allowedTools at
 * execution time) is a follow-on phase once Hermes actually calls tools.
 */
export function authorizeMissionCreation(input: MissionPolicyInput): PolicyDecision {
  if (!input.objective || !input.objective.trim()) {
    return { allowed: false, reason: "Mission objective is required." };
  }

  const forbidden = new Set(input.forbiddenActions ?? []);
  const overlap = (input.allowedTools ?? []).filter((tool) => forbidden.has(tool));
  if (overlap.length > 0) {
    return {
      allowed: false,
      reason: `Tool(s) listed as both allowed and forbidden: ${overlap.join(", ")}`,
    };
  }

  return { allowed: true };
}
