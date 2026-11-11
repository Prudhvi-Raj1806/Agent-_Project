import { randomUUID } from "node:crypto";
import { logger } from "@/server/logging/logger";
import { HermesError } from "./errors";
import { parseSseStream } from "./sse";
import type { HermesAdapter, HermesExecuteCallbacks, HermesExecuteInput, HermesHealth, HermesResult, HermesUsage } from "./types";

/**
 * Hermes Agent's `run.completed` event carries a real `usage` object —
 * `{input_tokens, output_tokens, total_tokens}` — verified against its own
 * source (api_server_runs.py `_USAGE_FIELDS`). Returns undefined (not a
 * fabricated zero) for anything that doesn't match that exact shape.
 */
function parseAgentUsage(usage: unknown): HermesUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  if (typeof u.input_tokens !== "number" || typeof u.output_tokens !== "number" || typeof u.total_tokens !== "number") {
    return undefined;
  }
  return { inputTokens: u.input_tokens, outputTokens: u.output_tokens, totalTokens: u.total_tokens };
}

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
 *   GET    /v1/capabilities               feature detection (run_submission, run_status,
 *                                          run_events_sse, run_stop, run_approval)
 * Every request needs `Authorization: Bearer <API_SERVER_KEY>`. SSE frames are
 * plain `data: <json>\n\n` (no `event:` line), so JARVIS's own `parseSseStream`
 * reads them as-is. The event's own type lives under the `event` key, not `type`.
 *
 * `execution_generation` (docs/ARCHITECTURE.md §18's 2026-10-18 addendum): the
 * approval endpoint 409s on a stale or missing generation. This adapter reads
 * it off the `approval.request` frame that announces the pending approval and
 * echoes it straight back — it never invents or caches one across frames,
 * since a stale cached value would 409 just the same as a missing one.
 * The docs confirm only `once`/`deny` as approval choices; `session`/`always`
 * are unconfirmed and are left out of the type rather than sent blind.
 * `session_id` is a different, newer, *separately unverified* mechanism
 * (distinct from the `X-Hermes-Session-Id` header GitHub issue #84406 reports
 * as ignored) — sent defensively on submit (keyed to missionId), never relied
 * on for continuity: prior-run context is still folded into the prompt on
 * every resumed run, per §18's standing instruction.
 *
 * Hermes Agent's tool-approval events come from its own terminal/plugin
 * approval system (`tools/approval.py`), not a generic {toolName, input}
 * shape: a pending approval carries `command` (shell) or `tool_name`
 * (plugin) plus an optional `request_id`. This adapter maps that onto
 * JARVIS's generic HermesToolRequest as faithfully as the wire allows; when
 * Hermes omits `request_id` (single pending approval, FIFO resolution) the
 * decision is sent back without one rather than inventing an id Hermes
 * would not recognize. A missing id or generation is logged and the decision
 * is still sent: dropping it would leave the run waiting on an approval that
 * never arrives, and a denial must always reach Hermes.
 *
 * Separately, api_server also emits `tool.started`/`tool.completed` for
 * EVERY tool call — including ones its own approval system never flags
 * (verified live, Sprint 06: read/write/shell calls that produce zero
 * `approval.request` frames still produce these two). This adapter forwards
 * them through `callbacks.onToolEvent` — the same generic observation
 * channel `http-adapter.ts` already used — giving JARVIS real visibility
 * into every Hermes-executed tool call. This is observation, not control:
 * unlike `approval.request`, Hermes does not pause or wait for a response to
 * `tool.started` — nothing here can block or deny a call Hermes's own
 * approval system didn't already choose to gate. See
 * JARVIS_MASTER_MEMORY.md's Hermes capability-boundary section for the full
 * trust-boundary implication.
 *
 * 2026-11-10 hardening, from re-reading the current api-server docs (Hermes v0.22.5):
 *   - Submit carries an `Idempotency-Key` (one fresh UUID per execute(), reused across
 *     submit retries). Per the docs an identical retry replays the original run_id
 *     instead of starting a second run, which is what makes retrying safe at all.
 *   - 429 (concurrent-run cap) and 503 (`runtime_draining` / `storage_unavailable`)
 *     are retried with backoff, honouring `Retry-After`.
 *   - `run.interrupted` is a documented terminal event on the runs stream. Treated as
 *     a retryable runtime failure, not a success and not a hang.
 *   - `GET /v1/capabilities` is probed in checkHealth(); `features.run_approval ===
 *     false` is surfaced as `approvalSupported: false`. Absence of the flag proves
 *     nothing (the docs' feature list is partial), so that case stays `undefined`.
 *   - Still UNVERIFIED against a live instance (architecture doc §11): the docs state
 *     `approval.request` explicitly only for MCP trust-gate consent, and don't say a
 *     general approval policy holds the tool before it runs. Do not treat this
 *     adapter's approval path as proof that arbitrary tool calls are gated.
 */
export interface HermesSubmitRetryOptions {
  /** Total submit attempts, including the first. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_SUBMIT_RETRY: HermesSubmitRetryOptions = { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 8_000 };
const MAX_RETRY_AFTER_MS = 30_000;

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** `Retry-After` as delta-seconds (the only form worth honouring here); undefined if absent/unparseable. */
function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (raw === null) return undefined;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

export class HermesAgentAdapter implements HermesAdapter {
  readonly mode = "real" as const;
  private readonly submitRetry: HermesSubmitRetryOptions;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    options: { submitRetry?: Partial<HermesSubmitRetryOptions> } = {}
  ) {
    this.submitRetry = { ...DEFAULT_SUBMIT_RETRY, ...options.submitRetry };
  }

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
      const approvalSupported = await this.probeApprovalSupport();
      return { healthy: true, version: body.version, latencyMs, approvalSupported };
    } catch (err) {
      logger.warn("hermes.agent.health.failed", {
        baseUrl: this.baseUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      return { healthy: false, latencyMs: Date.now() - startedAt };
    }
  }

  /** `GET /v1/capabilities` → whether the server advertises run approvals. undefined = unknown. */
  private async probeApprovalSupport(): Promise<boolean | undefined> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/capabilities`, {
        headers: this.headers(false),
        signal: AbortSignal.timeout(2_000),
      });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { features?: unknown };
      const features = body.features;
      // The docs' own feature list is partial, so a missing flag is "unknown", never "false".
      if (Array.isArray(features)) return features.includes("run_approval") ? true : undefined;
      if (features && typeof features === "object") {
        const flag = (features as Record<string, unknown>).run_approval;
        if (typeof flag === "boolean") {
          if (!flag) logger.warn("hermes.agent.capabilities.approval_unsupported", { baseUrl: this.baseUrl });
          return flag;
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Submits the run and returns its id. One Idempotency-Key per call, reused across
   * every retry: Hermes replays the original run_id for an identical retry, so a
   * retry after a lost response can't start a second run.
   */
  private async submitRun(input: HermesExecuteInput, prompt: string, signal: AbortSignal): Promise<string> {
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
    const idempotencyKey = randomUUID();
    const body = JSON.stringify({ input: prompt, session_id: input.missionId });
    const { maxAttempts, baseDelayMs, maxDelayMs } = this.submitRetry;

    for (let attempt = 1; ; attempt++) {
      const backoffMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);

      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/v1/runs`, {
          method: "POST",
          headers: { ...this.headers(true), "Idempotency-Key": idempotencyKey },
          body,
          signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        if (attempt < maxAttempts) {
          logger.warn("hermes.agent.submit.retry", { missionId: input.missionId, attempt, reason: "network" });
          await sleep(backoffMs, signal);
          continue;
        }
        throw new HermesError("NETWORK", `Hermes Agent submit failed: ${err instanceof Error ? err.message : String(err)}`, {
          retryable: true,
          cause: err,
        });
      }

      if (res.status === 429 || res.status === 503) {
        if (attempt < maxAttempts) {
          logger.warn("hermes.agent.submit.retry", { missionId: input.missionId, attempt, reason: String(res.status) });
          await sleep(parseRetryAfterMs(res) ?? backoffMs, signal);
          continue;
        }
        throw new HermesError(
          "RUNTIME",
          res.status === 429
            ? "Hermes Agent is at its concurrent-run limit (429)."
            : "Hermes Agent is draining or its storage is unavailable (503).",
          { retryable: true }
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new HermesError("AUTH", `Hermes Agent rejected the request (${res.status}) — check HERMES_AGENT_API_KEY.`, {
          retryable: false,
        });
      }
      if (res.status === 409) {
        // permission_denied (session_id owned by another surface) or idempotency_key_conflict.
        // Neither is fixed by retrying the same request.
        throw new HermesError("RUNTIME", "Hermes Agent refused the run (409) — session_id owned by another surface, or idempotency key conflict.", {
          retryable: false,
        });
      }
      if (!res.ok) {
        throw new HermesError("RUNTIME", `Hermes Agent rejected the run (${res.status})`, { retryable: res.status >= 500 });
      }

      const { run_id: runId } = (await res.json()) as { run_id: string };
      return runId;
    }
  }

  async execute(input: HermesExecuteInput, callbacks: HermesExecuteCallbacks): Promise<HermesResult> {
    // §18: a resumed mission's prior progress must be folded into the prompt text itself.
    // The orchestrator supplies `priorContext` (including the last known state); when a
    // caller supplies only `fromPercent`, fall back to a generic resume note so a resume
    // can never silently restart the objective from scratch.
    const prompt = input.priorContext
      ? `${input.priorContext}\n\n---\n\n${input.objective}`
      : input.fromPercent && input.fromPercent > 0
        ? `${input.objective}\n\n[Resuming a previously-paused mission at ${input.fromPercent}% progress. ` +
          `Continue the work already in progress — do not restart the objective from scratch.]`
        : input.objective;

    const runId = await this.submitRun(input, prompt, callbacks.signal);
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
    /**
     * Correlates a `tool.completed` frame back to its `tool.started` frame.
     * Hermes Agent's api_server wire (verified live, Sprint 06) carries no
     * per-call id for these two events — only `approval.request` has
     * `request_id`. Tool calls observed on this wire are strictly sequential
     * (one `tool.started`/`tool.completed` pair completes before the next
     * starts), so a single slot is sufficient; this is an id JARVIS
     * synthesizes for its own event correlation, not data Hermes reports —
     * do not read it as a Hermes-native call id.
     */
    let lastToolCallId: string | undefined;
    for await (const frame of parseSseStream(res.body)) {
      const event = frame as Record<string, unknown>;
      switch (event.event) {
        case "message.delta": {
          const delta = typeof event.delta === "string" ? event.delta : "";
          lastPercent = Math.min(90, lastPercent + 5);
          callbacks.onProgress(lastPercent, delta || "Hermes Agent is working…");
          break;
        }
        case "tool.started": {
          // Observation only — not a gate. Hermes does not wait for a
          // response to this frame the way it waits for `approval.request`;
          // by the time JARVIS sees this, the tool may already be running.
          // See JARVIS_MASTER_MEMORY.md's Hermes capability-boundary section
          // (Sprint 06) for why this closes a visibility gap, not a control
          // one.
          const toolName = typeof event.tool === "string" ? event.tool : "unknown";
          const timestamp = typeof event.timestamp === "number" ? event.timestamp : Date.now();
          lastToolCallId = `${runId}:${toolName}:${timestamp}`;
          callbacks.onToolEvent?.({ type: "tool.started", toolCallId: lastToolCallId, toolName, input: event.preview });
          break;
        }
        case "tool.completed": {
          const toolName = typeof event.tool === "string" ? event.tool : "unknown";
          const toolCallId = lastToolCallId ?? `${runId}:${toolName}:${Date.now()}`;
          if (event.error) {
            // Hermes Agent's own `tool.completed` frame only ever carries a
            // boolean `error` flag on this wire, never an error message —
            // there is nothing further to report without inventing detail
            // Hermes didn't send.
            callbacks.onToolEvent?.({
              type: "tool.failed",
              toolCallId,
              toolName,
              error: "Hermes Agent reported this tool call as failed (no further detail provided on this event).",
            });
          } else {
            callbacks.onToolEvent?.({
              type: "tool.completed",
              toolCallId,
              toolName,
              output: typeof event.duration === "number" ? { durationSeconds: event.duration } : undefined,
            });
          }
          lastToolCallId = undefined;
          break;
        }
        case "approval.request": {
          const requestId = typeof event.request_id === "string" ? event.request_id : undefined;
          const executionGeneration = typeof event.execution_generation === "number" ? event.execution_generation : undefined;
          const toolName =
            typeof event.tool_name === "string" ? event.tool_name : typeof event.command === "string" ? "terminal" : "unknown";
          if (requestId === undefined || executionGeneration === undefined) {
            // The docs list both as required on the approval call. The decision is still sent
            // with whatever the frame carried (see the header): Hermes may 409 it, but the
            // answer, above all a denial, always reaches Hermes.
            logger.warn("hermes.agent.approval.missing_fields", { runId, requestId, executionGeneration });
          }
          const decision = callbacks.onToolRequest
            ? await callbacks.onToolRequest({ toolCallId: requestId ?? runId, toolName, input: event.command ?? event })
            : { decision: "deny" as const, reason: "No tool-request handler configured — denying by default." };
          await this.sendApproval(runId, requestId, decision.decision === "allow" ? "once" : "deny", executionGeneration);
          break;
        }
        case "run.completed": {
          const usage = parseAgentUsage(event.usage);
          return {
            success: true,
            summary: "Hermes Agent run completed",
            output: typeof event.output === "string" ? event.output : "",
            source: "hermes",
            ...(usage ? { usage } : {}),
          };
        }
        case "run.failed":
          throw new HermesError("RUNTIME", typeof event.error === "string" ? event.error : "Hermes Agent run failed", {
            retryable: false,
          });
        case "run.cancelled":
          throw abortError();
        case "run.interrupted":
          // Documented terminal event on the runs stream (e.g. server restart/drain). Not a
          // success and not a user cancel — surface it so the mission fails visibly instead
          // of hanging or being mistaken for a clean completion.
          throw new HermesError("RUNTIME", "Hermes Agent run was interrupted before it finished.", { retryable: true });
        default:
          // message.delta/approval.responded/run.steered and anything newer — no action needed.
          break;
      }
    }

    throw new HermesError("PROTOCOL", "Hermes Agent event stream closed before sending a result.", { retryable: false });
  }

  private async sendApproval(
    runId: string,
    requestId: string | undefined,
    choice: "once" | "deny",
    executionGeneration: number | undefined
  ): Promise<void> {
    if (executionGeneration === undefined) {
      // §18/§20: a missing execution_generation 409s — this is the bug that
      // made every real approval fail before 2026-10-18. Logged loudly
      // rather than hidden, since a silent 409 here means the mission hangs
      // waiting for an approval Hermes will never register.
      logger.warn("hermes.agent.approval.missing_generation", { runId, requestId });
    }
    try {
      const res = await fetch(`${this.baseUrl}/v1/runs/${runId}/approval`, {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify({
          choice,
          ...(requestId ? { request_id: requestId } : {}),
          ...(executionGeneration !== undefined ? { execution_generation: executionGeneration } : {}),
        }),
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
