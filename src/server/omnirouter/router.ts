import { listProviders } from "./repository";
import type { RoutingDecision, TaskClassification } from "./types";

const CAPABILITY_BY_CLASSIFICATION: Record<TaskClassification, string> = {
  "long-context-research": "long-context",
  coding: "coding",
  "fast-general": "fast",
};

function classify(objective: string): TaskClassification {
  const text = objective.toLowerCase();
  if (/research|analy[sz]e|investigat|compare|architecture|evaluat/.test(text)) return "long-context-research";
  if (/code|implement|refactor|bug|debug|build|fix/.test(text)) return "coding";
  return "fast-general";
}

/**
 * Deterministic, explainable routing: classify -> filter to healthy
 * providers with capacity -> pick a model matching the required capability
 * -> pick an available account. No learned/black-box ranking — every
 * selection can be explained via `reason`.
 */
export function selectModel(input: { objective: string }): RoutingDecision | null {
  const classification = classify(input.objective);
  const requiredCapability = CAPABILITY_BY_CLASSIFICATION[classification];
  const providers = listProviders();

  for (const provider of providers) {
    if (provider.status !== "online") continue;
    if (provider.aggregateQuotaPercent >= 100) continue;

    const model =
      provider.models.find((m) => m.status === "available" && m.capabilities.includes(requiredCapability)) ??
      provider.models.find((m) => m.status === "available");
    if (!model) continue;

    const account =
      provider.accounts.find((a) => a.status === "online" && a.quotaPercent < 100) ?? provider.accounts[0];
    if (!account) continue;

    return {
      providerId: provider.id,
      providerName: provider.name,
      accountId: account.id,
      accountLabel: account.label,
      modelId: model.id,
      modelName: model.name,
      classification,
      reason: [
        `Classified objective as "${classification}".`,
        `${provider.name} is healthy with quota available.`,
        model.capabilities.includes(requiredCapability)
          ? `${model.name} matches required capability "${requiredCapability}".`
          : `${model.name} selected as ${provider.name}'s available default (no exact capability match).`,
      ],
    };
  }

  return null;
}
