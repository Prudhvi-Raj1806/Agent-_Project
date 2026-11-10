import type { RoutingDecision } from "@/server/omnirouter/types";

/**
 * These generic shapes used to live in a bespoke-wire contract.ts (deleted
 * 2026-10-19 per docs/ARCHITECTURE.md §20 — JARVIS talks to a real Hermes
 * Agent via agent-adapter.ts's api_server surface, not an invented
 * protocol). They stay here because they're adapter-agnostic: any
 * HermesAdapter implementation (today: agent-adapter.ts, mock-adapter.ts)
 * maps its own wire shape onto these.
 */

interface HermesToolFrameBase {
  toolCallId: string;
  toolName: string;
}

/** Hermes asking permission — sent BEFORE the tool runs, not after. */
export interface HermesToolRequestFrame extends HermesToolFrameBase {
  input?: unknown;
}

export type HermesToolEventFrame =
  | (HermesToolFrameBase & { type: "tool.started"; input?: unknown })
  | (HermesToolFrameBase & { type: "tool.completed"; output?: unknown })
  | (HermesToolFrameBase & { type: "tool.failed"; error: string });

/** Real token usage for a completed run. Only present when the backend actually reports it — never fabricated. */
export interface HermesUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** JARVIS's answer to a pending tool request. */
export interface HermesToolDecisionRequest {
  decision: "allow" | "deny";
  reason?: string;
}

export interface HermesHealth {
  healthy: boolean;
  version?: string;
  latencyMs: number;
}

export type HermesToolEvent = HermesToolEventFrame;
export type HermesToolRequest = HermesToolRequestFrame;
export type ToolDecision = HermesToolDecisionRequest;

export interface HermesExecuteInput {
  missionId: string;
  objective: string;
  routing: RoutingDecision;
  /** Progress percent to resume from (0 for a fresh run). */
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
  /** Real token usage, only when the backend actually reports it (today: HermesAgentAdapter only). Undefined, never fabricated as zero, when unknown. */
  usage?: HermesUsage;
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
