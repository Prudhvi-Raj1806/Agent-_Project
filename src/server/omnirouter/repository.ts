import { getDb } from "@/server/db/client";
import { fromJson, toJson } from "@/server/db/util";
import { PROVIDER_SEED } from "./config";
import type { DatabaseSync } from "node:sqlite";
import type { ModelStatus, Provider, ProviderAccount, ProviderModel, ProviderStatus } from "./types";

interface ProviderRow {
  id: string;
  name: string;
  status: string;
  health: string;
}

interface AccountRow {
  id: string;
  provider_id: string;
  label: string;
  status: string;
  api_key_env_var: string | null;
  quota_used_percent: number;
  reset_at: string | null;
}

interface ModelRow {
  id: string;
  provider_id: string;
  name: string;
  capabilities: string;
  context_window: number | null;
  status: string;
}

/**
 * Inserts any PROVIDER_SEED entry not yet in the database — additive only,
 * so adding a new provider to the seed (e.g. OmniRoute) reaches an existing
 * install without touching rows a running JARVIS has already started
 * tracking real status/quota for.
 */
function seedMissingProviders(db: DatabaseSync): void {
  const existingIds = new Set(
    (db.prepare(`SELECT id FROM providers`).all() as unknown as { id: string }[]).map((row) => row.id)
  );

  for (const seed of PROVIDER_SEED) {
    if (existingIds.has(seed.id)) continue;
    const configured = Boolean(process.env[seed.apiKeyEnvVar]);
    const status: ProviderStatus = configured ? "online" : "offline";

    db.prepare(`INSERT INTO providers (id, name, status, health) VALUES (?, ?, ?, ?)`).run(
      seed.id,
      seed.name,
      status,
      toJson({ quotaSource: "simulated" })
    );

    for (const account of seed.accounts) {
      db.prepare(
        `INSERT INTO provider_accounts (id, provider_id, label, status, api_key_env_var, quota_used_percent, reset_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(account.id, seed.id, account.label, status, seed.apiKeyEnvVar, 0, null);
    }

    for (const model of seed.models) {
      const modelStatus: ModelStatus = configured ? "available" : "unavailable";
      db.prepare(
        `INSERT INTO provider_models (id, provider_id, name, capabilities, context_window, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(model.id, seed.id, model.name, toJson(model.capabilities), model.contextWindow, modelStatus);
    }
  }
}

/** Full provider catalog, accounts aggregated under each provider. Server-internal (includes apiKeyEnvVar). */
export function listProviders(): Provider[] {
  const db = getDb();
  seedMissingProviders(db);

  const providerRows = db.prepare(`SELECT * FROM providers`).all() as unknown as ProviderRow[];
  const accountRows = db.prepare(`SELECT * FROM provider_accounts`).all() as unknown as AccountRow[];
  const modelRows = db.prepare(`SELECT * FROM provider_models`).all() as unknown as ModelRow[];

  return providerRows.map((row): Provider => {
    const accounts: ProviderAccount[] = accountRows
      .filter((a) => a.provider_id === row.id)
      .map((a) => ({
        id: a.id,
        providerId: a.provider_id,
        label: a.label,
        status: a.status as ProviderStatus,
        apiKeyEnvVar: a.api_key_env_var,
        quotaPercent: a.quota_used_percent,
        resetAt: a.reset_at,
      }));

    const models: ProviderModel[] = modelRows
      .filter((m) => m.provider_id === row.id)
      .map((m) => ({
        id: m.id,
        providerId: m.provider_id,
        name: m.name,
        capabilities: fromJson<string[]>(m.capabilities, []),
        contextWindow: m.context_window,
        status: m.status as ModelStatus,
      }));

    const aggregateQuotaPercent = accounts.length
      ? Math.round(accounts.reduce((sum, a) => sum + a.quotaPercent, 0) / accounts.length)
      : 0;

    return {
      id: row.id,
      name: row.name,
      status: row.status as ProviderStatus,
      accounts,
      models,
      aggregateQuotaPercent,
      health: fromJson(row.health, { quotaSource: "simulated" as const }),
    };
  });
}
