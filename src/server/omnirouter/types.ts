export type ProviderStatus = "online" | "degraded" | "rate_limited" | "offline";
export type ModelStatus = "available" | "unavailable";

export interface ProviderAccount {
  id: string;
  providerId: string;
  label: string;
  status: ProviderStatus;
  /** Name of the env var holding the credential — never the credential itself. */
  apiKeyEnvVar: string | null;
  quotaPercent: number;
  resetAt: string | null;
}

export interface ProviderModel {
  id: string;
  providerId: string;
  name: string;
  capabilities: string[];
  contextWindow: number | null;
  status: ModelStatus;
}

export interface ProviderHealth {
  quotaSource: "simulated" | "live";
  latencyMs?: number;
  lastCheckedAt?: string;
}

/** Internal, server-only shape — includes apiKeyEnvVar. Never send this to the browser as-is. */
export interface Provider {
  id: string;
  name: string;
  status: ProviderStatus;
  accounts: ProviderAccount[];
  models: ProviderModel[];
  aggregateQuotaPercent: number;
  health: ProviderHealth;
}

/** Sanitized shape safe to return from an API route. */
export type PublicProvider = Omit<Provider, "accounts"> & {
  accounts: Omit<ProviderAccount, "apiKeyEnvVar">[];
};

export interface ProviderSeedModel {
  id: string;
  name: string;
  capabilities: string[];
  contextWindow: number;
}

export interface ProviderSeedAccount {
  id: string;
  label: string;
}

export interface ProviderSeed {
  id: string;
  name: string;
  apiKeyEnvVar: string;
  accounts: ProviderSeedAccount[];
  models: ProviderSeedModel[];
}

export type TaskClassification = "long-context-research" | "coding" | "fast-general";

export interface RoutingDecision {
  providerId: string;
  providerName: string;
  accountId: string;
  accountLabel: string;
  modelId: string;
  modelName: string;
  classification: TaskClassification;
  reason: string[];
}
