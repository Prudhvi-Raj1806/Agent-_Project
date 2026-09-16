import { logger } from "@/server/logging/logger";
import type { HermesHealth } from "./contract";
import { HermesError } from "./errors";
import { parseSseStream } from "./sse";
import type { HermesAdapter, HermesExecuteCallbacks, HermesExecuteInput, HermesResult } from "./types";

/**
 * Adapter for a real, locally-running Hermes Agent
 * (github.com/NousResearch/hermes-agent), driven through its `api_server`
 * platform — an OpenAI-compatible HTTP+SSE surface distinct from the
 * `hermes serve` desktop-dashboard gateway (that one speaks JSON-RPC/WS on
 * a different port and is not what this adapter talks to).
 *
 * Enable it on the Hermes side with:
 *   hermes config set platforms.api_server.enabled true
 *   hermes config set platforms.api_server.host 127.0.0.1
 *   hermes config set platforms.api_server.port 8642
 *   echo "API_SERVER_KEY=<openssl rand -hex 32>" >> <hermes config env-path>
 *   hermes gateway run   (not `hermes serve` — that's the separate dashboard backend)
 *
 * Verified against Hermes Agent 0.21.0's own source
 * (gateway/platforms/api_server.py, api_server_runs.py):
 *   POST   /v1/runs                       {input, model?} -> {run_id}
 *   GET    /v1/runs/:id                   poll status
 *   GET    /v1/runs/:id/events            SSE: {event, run_id, ...fields}
 *   POST   /v1/runs/:id/approval          {choice: "once"|"deny"|"session"|"always", request_id?}
 *   POST   /v1/runs/:id/stop
 * Every request needs `Authorization: Bearer <API_SERVER_KEY>`. SSE frames are
 * plain `data: <json>\n\n` (no `event:` line), so JARVIS's own `parseSseStream`
 * reads them as-is. The event's own type lives under the `event` key, not `type`
 * — do not confuse this with JARVIS's HermesStreamFrame.type from contract.ts.
 *
 * Hermes Agent's tool-approval events come from its own terminal/plugin
 * approval system (`tools/approval.py`), not a generic {toolName, input}
 * shape: a pending approval carries `command` (shell) or `tool_name`
 * (plugin) plus an optional `request_id`. This adapter maps that onto
 * JARVIS's generic HermesToolRequest as faithfully as the wire allows; when
 * Hermes omits `request_id` (single pending approval, FIFO resolution) the
 * decision is sent back without one rather than inventing an id Hermes
 * would not recognize.
 */
export class HermesAgentAdapter implements HermesAdapter {
  readonly mode = "real" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  private headers(json: boolean): HeadersInit {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  async checkHealth(): Promise<HermesHealth> {
    const startedAt = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      const latencyMs = Date.now() - startedAt;
      if (!res.ok) return { healthy: false, latencyMs };
      const body = (await res.json()) as { version?: string };
      return { healthy: true, version: body.version, latencyMs };
    } catch (err) {
      logger.warn("hermes.agent.health.failed", {
        baseUrl: this.baseUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      return { healthy: false, latencyMs: Date.now() - startedAt };
    }
  }

  async execute(input: HermesExecuteInput, callbacks: HermesExecuteCallbacks): Promise<HermesResult> {
    let res: Response;
    try {
      // Deliberately NOT forwarding input.routing.modelId as `model`: that id is JARVIS's
      // own internal routing label (e.g. "omniroute-auto"), not a model string Hermes's
      // `_resolve_route()` can resolve — Hermes has no idea what JARVIS's OmniRouter calls
      // things. Omitting `model` lets Hermes fall back to whatever it's locally configured
      // to use (config.yaml `model.default`/`model.provider`), which is the real,
      // resolvable model string. JARVIS's routing decision still governs *whether* the
      // mission is allowed to run at all and is recorded for audit/UI — it just isn't a
      // cross-system model identifier.
      res = await fetch(`${this.baseUrl}/v1/runs`, {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify({ input: input.objective }),
        signal: callbacks.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new HermesError("NETWORK", `Hermes Agent submit failed: ${err instanceof Error ? err.message : String(err)}`, {
        retryable: true,
        cause: err,
      });
    }

    if (res.status === 401 || res.status === 403) {
      throw new HermesError("AUTH", `Hermes Agent rejected the request (${res.status}) — check HERMES_AGENT_API_KEY.`, {
        retryable: false,
      });
    }
    if (!res.ok) {
      throw new HermesError("RUNTIME", `Hermes Agent rejected the run (${res.status})`, { retryable: res.status >= 500 });
    }

    const { run_id: runId } = (await res.json()) as { run_id: string };
    logger.info("hermes.agent.run.started", { missionId: input.missionId, runId });

    try {
      return await this.stream(runId, callbacks);
    } catch (err) {
      if (callbacks.signal.aborted) void this.stop(runId); // best-effort — tell Hermes to actually stop
      throw err;
    }
  }

  private async stream(runId: string, callbacks: HermesExecuteCallbacks): Promise<HermesResult> {
    const res = await fetch(`${this.baseUrl}/v1/runs/${runId}/events`, {
      headers: this.headers(false),
      signal: callbacks.signal,
    });
    if (!res.ok || !res.body) {
      throw new HermesError("PROTOCOL", `Hermes Agent event stream returned ${res.status}`, { retryable: false });
    }

    let lastPercent = 0;
    for await (const frame of parseSseStream(res.body)) {
      const event = frame as Record<string, unknown>;
      switch (event.event) {
        case "message.delta": {
          const delta = typeof event.delta === "string" ? event.delta : "";
          lastPercent = Math.min(90, lastPercent + 5);
          callbacks.onProgress(lastPercent, delta || "Hermes Agent is working…");
          break;
        }
        case "approval.request": {
          const requestId = typeof event.request_id === "string" ? event.request_id : undefined;
          const toolName =
            typeof event.tool_name === "string" ? event.tool_name : typeof event.command === "string" ? "terminal" : "unknown";
          const decision = callbacks.onToolRequest
            ? await callbacks.onToolRequest({ toolCallId: requestId ?? runId, toolName, input: event.command ?? event })
            : { decision: "deny" as const, reason: "No tool-request handler configured — denying by default." };
          await this.sendApproval(runId, requestId, decision.decision === "allow" ? "once" : "deny");
          break;
        }
        case "run.completed":
          return {
            success: true,
            summary: "Hermes Agent run completed",
            output: typeof event.output === "string" ? event.output : "",
            source: "hermes",
          };
        case "run.failed":
          throw new HermesError("RUNTIME", typeof event.error === "string" ? event.error : "Hermes Agent run failed", {
            retryable: false,
          });
        case "run.cancelled":
          throw new DOMException("Aborted", "AbortError");
        default:
          // message.delta/approval.responded/run.steered and anything newer — no action needed.
          break;
      }
    }

    throw new HermesError("PROTOCOL", "Hermes Agent event stream closed before sending a result.", { retryable: false });
  }

  private async sendApproval(runId: string, requestId: string | undefined, choice: "once" | "deny"): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v1/runs/${runId}/approval`, {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify(requestId ? { choice, request_id: requestId } : { choice }),
      });
    } catch (err) {
      logger.warn("hermes.agent.approval.failed", { runId, requestId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async stop(runId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v1/runs/${runId}/stop`, {
        method: "POST",
        headers: this.headers(false),
        signal: AbortSignal.timeout(3_000),
      });
    } catch (err) {
      logger.warn("hermes.agent.stop.failed", { runId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
