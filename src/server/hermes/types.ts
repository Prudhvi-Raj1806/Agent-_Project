import type { RoutingDecision } from "@/server/omnirouter/types";

/**
 * JARVIS's own generic tool-request/decision shape — the boundary between
 * whichever real Hermes adapter is active and the orchestrator's policy
 * gate. A real adapter (agent-adapter.ts) maps Hermes's own wire events
 * (e.g. `approval.request`) onto this; it is not Hermes's wire format
 * itself. Previously defined in the now-deleted contract.ts (JARVIS's
 * invented, nothing-implements-it Hermes spec) — moved here because it's
 * still needed, just no longer tied to that dead contract.
 */

export interface HermesHealth {
  healthy: boolean;
  version?: string;
  latencyMs: number;
}

interface HermesToolBase {
  toolCallId: string;
  toolName: string;
}

export type HermesToolRequest = HermesToolBase & { input?: unknown };

export type HermesToolEvent =
  | (HermesToolBase & { type: "tool.started"; input?: unknown })
  | (HermesToolBase & { type: "tool.completed"; output?: unknown })
  | (HermesToolBase & { type: "tool.failed"; error: string });

export interface ToolDecision {
  decision: "allow" | "deny";
  reason?: string;
}

export interface HermesExecuteInput {
  missionId: string;
  objective: string;
  routing: RoutingDecision;
  /**
   * Prior mission context to fold into the prompt text. Hermes has no
   * verified cross-run resume primitive (architecture doc §18) — passing
   * `fromPercent` alone, as earlier code did, silently restarts the
   * objective from scratch on resume. `session_id` is now a documented
   * `POST /v1/runs` field (per Hermes's current api-server docs) and
   * agent-adapter.ts passes it when available, but whether it actually
   * restores history is unconfirmed against the still-open-looking
   * GitHub issue #84406 — so this text-folding fallback stays mandatory,
   * not optional, until that's verified live.
   */
  priorContext?: string;
  /** Progress percent to resume from (0 for a fresh run) — advisory only; see priorContext. */
  fromPercent?: number;
  allowedTools?: string[];
  forbiddenActions?: string[];
}

export interface HermesExecuteCallbacks {
  signal: AbortSignal;
  onProgress: (percent: number, note: string) => void;
  /** Only a real adapter with tool-calling will ever invoke this — mock execution has no tools. */
  onToolEvent?: (event: HermesToolEvent) => void;
  /**
   * Called BEFORE a tool runs; must resolve to a decision before the adapter
   * will tell Hermes it may proceed. Left unset, the adapter denies by
   * default — an execution-time gate that no one has hooked up is a closed
   * gate, not an open one.
   */
  onToolRequest?: (request: HermesToolRequest) => Promise<ToolDecision>;
}

export interface HermesResult {
  success: boolean;
  summary: string;
  output: string;
  source: "mock" | "hermes";
}

/**
 * The one boundary JARVIS should ever call into Hermes through. No
 * Hermes-specific code should exist outside this module and its
 * implementations.
 */
export interface HermesAdapter {
  readonly mode: "mock" | "real";
  execute(input: HermesExecuteInput, callbacks: HermesExecuteCallbacks): Promise<HermesResult>;
  checkHealth(): Promise<HermesHealth>;
}
