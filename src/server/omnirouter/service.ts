import { listProviders } from "./repository";
import type { PublicProvider } from "./types";

/** Sanitized provider list — safe to return from an API route. No secrets, ever. */
export function listPublicProviders(): PublicProvider[] {
  return listProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
    status: provider.status,
    aggregateQuotaPercent: provider.aggregateQuotaPercent,
    health: provider.health,
    models: provider.models,
    accounts: provider.accounts.map((account) => ({
      id: account.id,
      providerId: account.providerId,
      label: account.label,
      status: account.status,
      quotaPercent: account.quotaPercent,
      resetAt: account.resetAt,
    })),
  }));
}

export { selectModel } from "./router";
export type { PublicProvider, Provider, RoutingDecision } from "./types";
