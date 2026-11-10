/**
 * The DecisionModelAdapter interface from docs/ARCHITECTURE.md §17 — a
 * third shape alongside RuntimeAdapter (§15) and OmniRoute's generative
 * contract: a single typed judgment with a confidence score, not a token
 * stream, and not something with an approve/cancel lifecycle. Laya is the
 * default implementation (§6); a Jev-successor or any future System-1
 * decision model plugs in the same way — one new adapter file, nothing in
 * the caller changes.
 */

export interface DecisionModelHealth {
  status: "ok" | "degraded";
  latencyMs?: number;
}

export interface ClassifyInput {
  /** The thing being judged — here, a mission objective. Kept as a plain string; richer state can be JSON-stringified by the caller. */
  state: string;
  /** The typed question to answer, e.g. "category" or "urgency". */
  question: string;
  /** The allowed answers for `question` — Laya's classification is closed-set, not open-ended generation. */
  schema: string[];
}

export interface ClassifyResult {
  decision: string;
  /** 0–1. Low confidence is a real, expected answer — callers must have a plan for it, not treat it as an error. */
  confidence: number;
}

export interface DecisionModelAdapter {
  readonly mode: "laya" | "fallback";
  classify(input: ClassifyInput): Promise<ClassifyResult>;
  health(): Promise<DecisionModelHealth>;
}
