import { logger } from "@/server/logging/logger";
import type { ClassifyInput, ClassifyResult, DecisionModelAdapter, DecisionModelHealth } from "./types";

/**
 * Client for a self-hosted Laya instance (ConvAI Innovations,
 * Apache-2.0 — `pip install laya`; see docs/ARCHITECTURE.md §6/§18). No
 * official HTTP wire is documented anywhere this doc's sweeps found — Laya
 * ships as a local Python/MLX library, not a service. This adapter assumes
 * the minimal REST wrapper JARVIS's own `LAYA_BASE_URL` deployment exposes:
 *   POST {baseUrl}/classify  {state, question, schema} -> {decision, confidence}
 *   GET  {baseUrl}/health                              -> {status}
 * If a real deployment's wire differs, this file is the one thing that
 * needs to change — nothing calling `DecisionModelAdapter` does.
 */
export class LayaHttpAdapter implements DecisionModelAdapter {
  readonly mode = "laya" as const;

  constructor(private readonly baseUrl: string) {}

  async classify(input: ClassifyInput): Promise<ClassifyResult> {
    try {
      const res = await fetch(`${this.baseUrl}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(2_000),
      });
      if (!res.ok) throw new Error(`Laya classify returned ${res.status}`);
      const body = (await res.json()) as { decision?: unknown; confidence?: unknown };
      if (typeof body.decision !== "string" || typeof body.confidence !== "number") {
        throw new Error("Laya classify response missing decision/confidence");
      }
      return { decision: body.decision, confidence: body.confidence };
    } catch (err) {
      // §6: Laya is a fast pre-classifier, never a gate — a failure here must
      // degrade to "unknown, low confidence", not block or crash the caller.
      logger.warn("laya.classify.failed", { baseUrl: this.baseUrl, error: err instanceof Error ? err.message : String(err) });
      return { decision: "unknown", confidence: 0 };
    }
  }

  async health(): Promise<DecisionModelHealth> {
    const startedAt = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1_500) });
      const latencyMs = Date.now() - startedAt;
      return res.ok ? { status: "ok", latencyMs } : { status: "degraded", latencyMs };
    } catch (err) {
      logger.warn("laya.health.failed", { baseUrl: this.baseUrl, error: err instanceof Error ? err.message : String(err) });
      return { status: "degraded", latencyMs: Date.now() - startedAt };
    }
  }
}
