import { ACTION_REGISTRY } from "@/server/actions/registry";
import { evaluateToolRequest } from "@/server/security/tool-policy";
import type { ToolDefinition } from "./types";

/**
 * Moves the existing Quick Actions behind the Tool Registry, rather than
 * duplicating their metadata. `risk` is derived from
 * security/tool-policy.ts's own rule table (via `evaluateToolRequest`) so
 * there is exactly one place a tool's risk is declared, not two that can
 * drift apart.
 */
const TOOL_REGISTRY: Record<string, ToolDefinition> = Object.fromEntries(
  Object.values(ACTION_REGISTRY).map((action) => {
    const definition: ToolDefinition = {
      id: action.id,
      description: action.label,
      risk: evaluateToolRequest({ toolName: action.id, allowedTools: [], forbiddenActions: [] }).risk,
      capabilities: ["os.automation"],
      permission: "owner",
      inputSchema: null,
      sideEffects: ["local-os"],
      verificationStrategy: action.verificationStrategy ?? "self-reported",
      execute: action.run,
      ...(action.verify ? { verify: action.verify } : {}),
    };
    return [action.id, definition];
  })
);

export function getTool(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[id];
}

export function listTools(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY);
}
