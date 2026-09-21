import { logger } from "@/server/logging/logger";
import type { RoutingDecision } from "@/server/omnirouter/types";

/**
 * The provider abstraction beneath OmniRouter's routing decision:
 *
 *   JARVIS -> Model Router (omnirouter/router.ts, decision only) ->
 *   Provider abstraction (this file, the actual API call) -> model
 *
 * OmniRouter decides *which* provider/model to use and never calls a
 * provider API itself (see JARVIS_MASTER_MEMORY.md's module-boundaries
 * section). This is the one place a one-shot text completion (as opposed to
 * a full Hermes mission — agentic, tool-using, budget/checkpoint-tracked)
 * is actually executed. No application code outside this module may call a
 * model provider's API directly.
 */

export interface CompletionRequest {
  routing: RoutingDecision;
  prompt: string;
  maxTokens?: number;
}

export type CompletionResult = { ok: true; text: string } | { ok: false; message: string };

/** OmniRouter's internal `claude-*` seed ids are display ids, not real Anthropic API model strings. */
const ANTHROPIC_MODEL_IDS: Record<string, string> = {
  "claude-opus": "claude-opus-5",
  "claude-sonnet": "claude-sonnet-5",
  "claude-haiku": "claude-haiku-4-5-20251001",
};

async function completeWithAnthropic(request: CompletionRequest): Promise<CompletionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, message: "ANTHROPIC_API_KEY is not configured." };

  const model = ANTHROPIC_MODEL_IDS[request.routing.modelId] ?? request.routing.modelId;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 300,
        messages: [{ role: "user", content: request.prompt }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, message: `Anthropic request failed (${res.status}): ${errBody.slice(0, 500)}` };
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const text = data.content?.[0]?.text;
    if (!text) return { ok: false, message: "Couldn't parse a completion from the Anthropic response." };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, message: `Anthropic request failed: ${String(err)}` };
  }
}

/**
 * Dispatches a one-shot completion to whichever provider OmniRouter
 * selected. Only Anthropic has a real implementation today — every other
 * seeded provider (OpenAI, DeepSeek, OmniRoute) honestly reports "not
 * implemented" rather than fabricating a result, per the project's Honesty
 * Rule. Extend this switch, not callers, when a new provider is wired up.
 */
export async function runProviderCompletion(request: CompletionRequest): Promise<CompletionResult> {
  switch (request.routing.providerId) {
    case "anthropic":
      return completeWithAnthropic(request);
    default:
      logger.warn("provider.completion.unimplemented", { providerId: request.routing.providerId });
      return {
        ok: false,
        message: `No completion implementation exists yet for provider "${request.routing.providerName}".`,
      };
  }
}
