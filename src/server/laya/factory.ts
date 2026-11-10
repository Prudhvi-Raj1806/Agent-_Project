import { LayaFallbackAdapter } from "./fallback-adapter";
import { LayaHttpAdapter } from "./http-adapter";
import type { DecisionModelAdapter } from "./types";

/** The only place that decides real Laya vs. the conservative fallback. */
export function getDecisionModelAdapter(): DecisionModelAdapter {
  const baseUrl = process.env.LAYA_BASE_URL;
  return baseUrl ? new LayaHttpAdapter(baseUrl) : new LayaFallbackAdapter();
}

export type { ClassifyInput, ClassifyResult, DecisionModelAdapter, DecisionModelHealth } from "./types";

/** Boolean presence check only, for the Settings page — never reads the key values. */
export function getLayaConnectionInfo(): { mode: "laya" | "fallback" } {
  return { mode: process.env.LAYA_BASE_URL ? "laya" : "fallback" };
}
