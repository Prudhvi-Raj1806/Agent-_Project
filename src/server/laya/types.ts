/**
 * The DecisionModelAdapter interface (architecture doc §17).
 *
 * Not a HermesAdapter — there's nothing to approve or cancel; a
 * classification call either returns a typed judgment or it doesn't. Not
 * an OmniRoute model either — OmniRoute's contract is generative (prompt
 * in, tokens/stream out); this is a single typed judgment with a
 * confidence score, under a tight latency budget. Laya is the default
 * implementation (§6/§18: adopted 2026-10-12, stays default until
 * something clearly better replaces it per the §17 test) — swap the
 * adapter, not the Mission Router/orchestrator, if that happens.
 */

export type HealthState = "ok" | "degraded";

export interface Decision {
  choice: string;
  confidence: number;
}

export interface DecisionModelAdapter {
  classify(input: { state: string; question: string; options: string[] }): Promise<Decision>;
  health(): Promise<HealthState>;
}
