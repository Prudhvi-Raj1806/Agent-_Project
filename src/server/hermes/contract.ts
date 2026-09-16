import type { RoutingDecision } from "@/server/omnirouter/types";

/**
 * The Hermes wire contract — HTTP + Server-Sent Events.
 *
 * No real Hermes runtime exists yet. This is JARVIS's own specification for
 * what one must implement to plug in; treat it as a contract to hand to
 * whoever builds Hermes, not as a description of a service that exists.
 * `http-adapter.ts` implements the client side; `http-adapter.test.ts`
 * verifies it against a local fixture server that speaks this same
 * contract, standing in for the real thing.
 *
 *   POST {baseUrl}/missions                              submit a mission, get a run handle
 *   GET  {baseUrl}/missions/:runId/stream                SSE stream of HermesStreamFrame
 *   POST {baseUrl}/missions/:runId/tool-decisions/:id    JARVIS's answer to a `tool.requested` frame
 *   POST {baseUrl}/missions/:runId/cancel                best-effort stop
 *   GET  {baseUrl}/health                                liveness/readiness
 *
 * Every submission carries `correlationId` (JARVIS's missionId). A real
 * Hermes implementation MUST treat resubmission of the same correlationId
 * as idempotent (return/resume the existing run) so JARVIS's submit retries
 * can never start a duplicate execution.
 *
 * Before running any tool, Hermes MUST emit a `tool.requested` frame and
 * wait for JARVIS to POST a decision to the tool-decisions endpoint before
 * proceeding — this is what lets execution-time security actually gate a
 * tool call rather than just log it after the fact. A denied decision means
 * Hermes must not run that call.
 */

export interface HermesSubmitRequest {
  correlationId: string;
  objective: string;
  routing: RoutingDecision;
  fromPercent: number;
  allowedTools: string[];
  forbiddenActions: string[];
}

export interface HermesSubmitResponse {
  correlationId: string;
  runId: string;
}

interface HermesToolFrameBase {
  toolCallId: string;
  toolName: string;
}

/** Hermes asking permission — sent BEFORE the tool runs, not after. */
export interface HermesToolRequestFrame extends HermesToolFrameBase {
  type: "tool.requested";
  input?: unknown;
}

export type HermesToolEventFrame =
  | (HermesToolFrameBase & { type: "tool.started"; input?: unknown })
  | (HermesToolFrameBase & { type: "tool.completed"; output?: unknown })
  | (HermesToolFrameBase & { type: "tool.failed"; error: string });

export type HermesStreamFrame =
  | { type: "progress"; percent: number; note: string }
  | HermesToolRequestFrame
  | HermesToolEventFrame
  | { type: "result"; success: boolean; summary: string; output: string }
  | { type: "error"; message: string; retryable: boolean };

/** JARVIS's answer to a `tool.requested` frame, POSTed to the tool-decisions endpoint. */
export interface HermesToolDecisionRequest {
  decision: "allow" | "deny";
  reason?: string;
}

export interface HermesHealth {
  healthy: boolean;
  version?: string;
  latencyMs: number;
}
