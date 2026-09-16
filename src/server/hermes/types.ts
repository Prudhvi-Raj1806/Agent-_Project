import type { RoutingDecision } from "@/server/omnirouter/types";
import type { HermesHealth, HermesToolDecisionRequest, HermesToolEventFrame, HermesToolRequestFrame } from "./contract";

export type HermesToolEvent = HermesToolEventFrame;
export type HermesToolRequest = Omit<HermesToolRequestFrame, "type">;
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

export type { HermesHealth } from "./contract";
