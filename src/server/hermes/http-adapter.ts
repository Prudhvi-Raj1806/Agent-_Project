import { logger } from "@/server/logging/logger";
import type {
  HermesHealth,
  HermesStreamFrame,
  HermesSubmitRequest,
  HermesSubmitResponse,
  HermesToolDecisionRequest,
} from "./contract";
import { HermesError } from "./errors";
import { withRetry } from "./retry";
import { parseSseStream } from "./sse";
import type { HermesAdapter, HermesExecuteCallbacks, HermesExecuteInput, HermesResult } from "./types";

export interface HermesHttpAdapterOptions {
  submitTimeoutMs?: number;
  healthTimeoutMs?: number;
  submitRetryAttempts?: number;
  submitRetryBaseDelayMs?: number;
}

function isAbortError(err: unknown): err is DOMException {
  return err instanceof DOMException && err.name === "AbortError";
}

function toHermesError(err: unknown, context: string): HermesError {
  if (err instanceof HermesError) return err;
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new HermesError("TIMEOUT", `${context} timed out`, { retryable: true, cause: err });
  }
  return new HermesError("NETWORK", `${context} failed: ${err instanceof Error ? err.message : String(err)}`, {
    retryable: true,
    cause: err,
  });
}

async function readJson<T>(res: Response, context: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new HermesError("PROTOCOL", `${context} response was not valid JSON: ${text.slice(0, 200)}`, { cause: err });
  }
}

/**
 * Real HTTP + SSE client for a Hermes runtime, implementing the contract
 * documented in ./contract.ts. No such runtime exists yet in this
 * environment — this class has only ever been exercised against a local
 * fixture server standing in for Hermes (see http-adapter.test.ts).
 * Connecting a real Hermes means either it implements this contract, or
 * this file is updated to match whatever contract it actually exposes.
 */
export class HermesHttpAdapter implements HermesAdapter {
  readonly mode = "real" as const;
  private readonly options: Required<HermesHttpAdapterOptions>;

  constructor(
    private readonly baseUrl: string,
    options: HermesHttpAdapterOptions = {}
  ) {
    this.options = {
      submitTimeoutMs: options.submitTimeoutMs ?? 10_000,
      healthTimeoutMs: options.healthTimeoutMs ?? 2_000,
      submitRetryAttempts: options.submitRetryAttempts ?? 3,
      submitRetryBaseDelayMs: options.submitRetryBaseDelayMs ?? 500,
    };
  }

  async checkHealth(): Promise<HermesHealth> {
    const startedAt = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(this.options.healthTimeoutMs) });
      const latencyMs = Date.now() - startedAt;
      if (!res.ok) return { healthy: false, latencyMs };
      const body = await readJson<{ version?: string }>(res, "health");
      return { healthy: true, version: body.version, latencyMs };
    } catch (err) {
      logger.warn("hermes.health.failed", {
        baseUrl: this.baseUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      return { healthy: false, latencyMs: Date.now() - startedAt };
    }
  }

  async execute(input: HermesExecuteInput, callbacks: HermesExecuteCallbacks): Promise<HermesResult> {
    const submitResponse = await withRetry((attempt) => this.submit(input, callbacks.signal, attempt), {
      attempts: this.options.submitRetryAttempts,
      baseDelayMs: this.options.submitRetryBaseDelayMs,
      signal: callbacks.signal,
    });

    try {
      return await this.stream(submitResponse.runId, callbacks);
    } catch (err) {
      if (callbacks.signal.aborted) {
        void this.cancel(submitResponse.runId); // best-effort — tell Hermes to actually stop
      }
      throw err;
    }
  }

  private async submit(input: HermesExecuteInput, signal: AbortSignal, attempt: number): Promise<HermesSubmitResponse> {
    const request: HermesSubmitRequest = {
      correlationId: input.missionId,
      objective: input.objective,
      routing: input.routing,
      fromPercent: input.fromPercent ?? 0,
      allowedTools: input.allowedTools ?? [],
      forbiddenActions: input.forbiddenActions ?? [],
    };

    logger.info("hermes.submit", { missionId: input.missionId, baseUrl: this.baseUrl, attempt });

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.options.submitTimeoutMs)]),
      });
    } catch (err) {
      if (isAbortError(err) && signal.aborted) throw err; // real cancellation — do not reclassify
      throw toHermesError(err, "Hermes submit request");
    }

    if (res.status === 401 || res.status === 403) {
      throw new HermesError("AUTH", `Hermes rejected the request (${res.status})`, { retryable: false });
    }
    if (res.status >= 400 && res.status < 500) {
      throw new HermesError("VALIDATION", `Hermes rejected the mission (${res.status})`, { retryable: false });
    }
    if (res.status >= 500) {
      throw new HermesError("RUNTIME", `Hermes runtime error (${res.status})`, { retryable: true });
    }

    return readJson<HermesSubmitResponse>(res, "submit");
  }

  private async stream(runId: string, callbacks: HermesExecuteCallbacks): Promise<HermesResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/missions/${runId}/stream`, {
        headers: { Accept: "text/event-stream" },
        signal: callbacks.signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw toHermesError(err, "Hermes stream request");
    }

    if (!res.ok || !res.body) {
      throw new HermesError("PROTOCOL", `Hermes stream endpoint returned ${res.status}`, { retryable: false });
    }

    for await (const frame of parseSseStream(res.body)) {
      const parsed = frame as HermesStreamFrame;
      switch (parsed.type) {
        case "progress":
          callbacks.onProgress(parsed.percent, parsed.note);
          break;
        case "tool.requested": {
          const decision = callbacks.onToolRequest
            ? await callbacks.onToolRequest(parsed)
            : { decision: "deny" as const, reason: "No tool-request handler is configured — denying by default." };
          await this.sendToolDecision(runId, parsed.toolCallId, decision, callbacks.signal);
          break;
        }
        case "tool.started":
        case "tool.completed":
        case "tool.failed":
          callbacks.onToolEvent?.(parsed);
          break;
        case "result":
          return { success: parsed.success, summary: parsed.summary, output: parsed.output, source: "hermes" };
        case "error":
          throw new HermesError("RUNTIME", parsed.message, { retryable: parsed.retryable });
        default:
          logger.warn("hermes.stream.unknown_frame", { runId, frame: parsed });
      }
    }

    throw new HermesError("PROTOCOL", "Hermes stream closed before sending a result.", { retryable: false });
  }

  private async sendToolDecision(
    runId: string,
    toolCallId: string,
    decision: HermesToolDecisionRequest,
    signal: AbortSignal
  ): Promise<void> {
    logger.info("hermes.tool_decision", { runId, toolCallId, decision: decision.decision });
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/missions/${runId}/tool-decisions/${toolCallId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision),
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.options.submitTimeoutMs)]),
      });
    } catch (err) {
      if (isAbortError(err) && signal.aborted) throw err;
      throw toHermesError(err, "Hermes tool-decision request");
    }
    if (!res.ok) {
      // Hermes never learns our decision if this fails — the mission cannot safely continue.
      throw new HermesError("RUNTIME", `Hermes rejected the tool decision (${res.status})`, { retryable: false });
    }
  }

  private async cancel(runId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/missions/${runId}/cancel`, { method: "POST", signal: AbortSignal.timeout(3_000) });
    } catch (err) {
      logger.warn("hermes.cancel.failed", { runId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
