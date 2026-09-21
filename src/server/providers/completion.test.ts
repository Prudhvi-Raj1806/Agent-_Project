import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutingDecision } from "@/server/omnirouter/types";
import { runProviderCompletion } from "./completion";

function routing(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    providerId: "anthropic",
    providerName: "Anthropic",
    accountId: "anthropic-personal",
    accountLabel: "Personal",
    modelId: "claude-sonnet",
    modelName: "Claude Sonnet",
    classification: "fast-general",
    reason: ["test"],
    ...overrides,
  };
}

describe("runProviderCompletion — the provider abstraction beneath OmniRouter", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("calls the real Anthropic Messages API directly — no other module may do this", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ text: "a summary" }] }), { status: 200 })
    );

    const result = await runProviderCompletion({ routing: routing(), prompt: "Summarize: hello" });

    expect(result).toEqual({ ok: true, text: "a summary" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("claude-sonnet-5"); // mapped from OmniRouter's internal "claude-sonnet" seed id
    expect(body.messages[0].content).toBe("Summarize: hello");
  });

  it("reports missing configuration honestly instead of fabricating a completion", async () => {
    vi.unstubAllEnvs(); // no ANTHROPIC_API_KEY

    const result = await runProviderCompletion({ routing: routing(), prompt: "Summarize: hello" });

    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a failed Anthropic response honestly rather than returning fabricated text", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    const result = await runProviderCompletion({ routing: routing(), prompt: "Summarize: hello" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("429");
  });

  it("returns an honest 'not implemented' result for a provider with no completion path, instead of guessing", async () => {
    const result = await runProviderCompletion({ routing: routing({ providerId: "openai", providerName: "OpenAI" }), prompt: "hi" });

    expect(result).toEqual({ ok: false, message: 'No completion implementation exists yet for provider "OpenAI".' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
