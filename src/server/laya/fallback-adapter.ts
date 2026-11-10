import type { ClassifyInput, ClassifyResult, DecisionModelAdapter, DecisionModelHealth } from "./types";

/**
 * Used when LAYA_BASE_URL is unset. Always reports "degraded" and always
 * answers with zero confidence — never a guessed category standing in for a
 * real classification. §6: "the router falls back to LLM routing when
 * degraded" — this adapter is what makes that fallback the honest default,
 * not an afterthought wired in later.
 */
export class LayaFallbackAdapter implements DecisionModelAdapter {
  readonly mode = "fallback" as const;

  async classify(_input: ClassifyInput): Promise<ClassifyResult> {
    return { decision: "unknown", confidence: 0 };
  }

  async health(): Promise<DecisionModelHealth> {
    return { status: "degraded" };
  }
}
