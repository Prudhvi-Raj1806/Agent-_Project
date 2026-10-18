import { logger } from "@/server/logging/logger";
import type { Decision, DecisionModelAdapter, HealthState } from "./types";

/**
 * Laya adapter — self-hosted, Apache-2.0 (Convai Innovations, ModernBERT-
 * large). Laya's own serving wrapper isn't pinned to a frozen wire format
 * by anything this architecture doc verified, so this client targets a
 * minimal, obvious HTTP contract: `POST /classify` with a choice-type
 * question, `GET /health`. If a real Laya deployment serves something
 * else, this file is the only one that needs to change — that's the
 * point of the adapter boundary (§17).
 */
export class LayaAdapter implements DecisionModelAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = 5_000
  ) {}

  async classify(input: { state: string; question: string; options: string[] }): Promise<Decision> {
    const res = await fetch(`${this.baseUrl}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "choice", ...input }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Laya classify failed: HTTP ${res.status}`);
    const data = (await res.json()) as { choice: string; confidence?: number };
    return { choice: data.choice, confidence: data.confidence ?? 0 };
  }

  async health(): Promise<HealthState> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(this.timeoutMs) });
      return res.ok ? "ok" : "degraded";
    } catch {
      return "degraded";
    }
  }
}

/**
 * Used when Laya can't be reached, or no LAYA_BASE_URL is configured.
 * Defaults to the first (caller-ordered: safest-first) option at zero
 * confidence rather than failing the mission outright or silently
 * picking something riskier than Laya would have.
 */
export class UnavailableLayaAdapter implements DecisionModelAdapter {
  async classify(input: { question: string; options: string[] }): Promise<Decision> {
    logger.warn("laya.unavailable", { question: input.question });
    return { choice: input.options[0], confidence: 0 };
  }

  async health(): Promise<HealthState> {
    return "degraded";
  }
}
