import { LayaAdapter } from "./laya-adapter";
import type { DecisionModelAdapter } from "./types";
import { UnavailableLayaAdapter } from "./laya-adapter";

/** The only place that decides which DecisionModelAdapter is active. */
export function getLayaAdapter(): DecisionModelAdapter {
  const baseUrl = process.env.LAYA_BASE_URL;
  return baseUrl ? new LayaAdapter(baseUrl) : new UnavailableLayaAdapter();
}

export type { DecisionModelAdapter, Decision, HealthState } from "./types";
