import { logger } from "@/server/logging/logger";
import { HermesError } from "./errors";
import { parseSseStream } from "./sse";
import type { HermesAdapter, HermesExecuteCallbacks, HermesExecuteInput, HermesHealth, HermesResult } from "./types";

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
 * Originally written against Hermes Agent 0.21.0's own source
 * (gateway/platforms/api_server.py, api_server_runs.py); re-checked against
 * Hermes's current official api-server docs (hermes-agent.nousresearch.com)
 * on 2026-10-18 and corrected where they disagreed:
 *   POST   /v1/runs                       {input, session_id?} -> {run_id, status}
 *   GET    /v1/runs/:id                   poll status (session_id, model, output, usage, pending_controls)
 *   GET    /v1/runs/:id/events            SSE: {event, run_id, ...fields}
 *   POST   /v1/runs/:id/approval          {request_id, execution_generation, choice: "once"|"deny"}
 *   POST   /v1/runs/:id/stop
 * Every request needs `Authorization: Bearer <API_SERVER_KEY>`. SSE frames are
 * plain `data: <json>\n\n` (no `event:` line), so JARVIS's own `parseSseStream`
 * reads them as-is. The event's own type lives under the `event` key, not `type`.
 *
 * Two corrections from the 2026-10-18 re-check:
 *   1. `execution_generation` is REQUIRED on the approval call (the docs
 *      say a stale/missing generation gets HTTP 409) — the original version
 *      of this file omitted it. The SSE `approval.request` event is assumed
 *      to carry it; if a live server's event omits it, this needs another look.
 *   2. The docs confirm only `once`/`deny` as approval choices. `session`/
 *      `always` (claimed above from 0.21.0 source) are UNCONFIRMED against
 *      current docs — left out of the type below rather than sent blind.
 *
 * `session_id` on submit is new information not yet reconciled with
 * architecture doc §18's "session-continuity gap" (GitHub issue #84406,
 * about the `X-Hermes-Session-Id` HEADER being ignored on `/v1/runs` — a
 * different mechanism than this documented session_id BODY field, and
 * unclear whether this is the fix for that issue or a separate, equally
 * unverified path). This adapter sends it defensively (keyed to missionId,
 * stable across a mission's runs) but does NOT rely on it: `priorContext`
 * is still folded into the prompt on every run regardless, per §18's
 * standing instruction, until session_id is confirmed to work against a
 * live instance.
 *
 * Hermes Agent's tool-approval events come from its own terminal/plugin
 * approval system, not a generic {toolName, input} shape: a pending
 * approval carries `command` (shell) or `tool_name` (plugin) plus
 * `request_id` and `execution_generation`. This adapter maps that onto
 * JARVIS's generic HermesToolRequest as faithfully as the wire allows.
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
    const prompt = input.priorContext ? `${input.priorContext}\n\n---\n\n${input.objective}` : input.objective;

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
      //
      // session_id: missionId, sent defensively (see file header) — NOT a substitute
      // for priorContext above, which is what actually carries history today.
      res = await fetch(`${this.baseUrl}/v1/runs`, {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify({ input: prompt, session_id: input.missionId }),
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
          const executionGeneration = typeof event.execution_generation === "number" ? event.execution_generation : undefined;
          const toolName =
            typeof event.tool_name === "string" ? event.tool_name : typeof event.command === "string" ? "terminal" : "unknown";
          if (requestId === undefined || executionGeneration === undefined) {
            // Docs require both on the approval call; without them we can't resolve this
            // request at all. Deny rather than send a call the server will 409 on anyway.
            logger.warn("hermes.agent.approval.missing_fields", { runId, event });
          }
          const decision = callbacks.onToolRequest
            ? await callbacks.onToolRequest({ toolCallId: requestId ?? runId, toolName, input: event.command ?? event })
            : { decision: "deny" as const, reason: "No tool-request handler configured — denying by default." };
          if (requestId !== undefined && executionGeneration !== undefined) {
            await this.sendApproval(runId, requestId, executionGeneration, decision.decision === "allow" ? "once" : "deny");
          }
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

  private async sendApproval(
    runId: string,
    requestId: string,
    executionGeneration: number,
    choice: "once" | "deny"
  ): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/runs/${runId}/approval`, {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify({ request_id: requestId, execution_generation: executionGeneration, choice }),
      });
      if (res.status === 409) {
        // Stale generation — the run moved on before our decision arrived (e.g. a
        // pause/cancel raced the approval). Not fatal to the overall run; log and move on.
        logger.warn("hermes.agent.approval.stale_generation", { runId, requestId, executionGeneration });
      }
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
