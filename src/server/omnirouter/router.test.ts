import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { listProviders } from "./repository";
import { selectModel } from "./router";

describe("omnirouter", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
    vi.unstubAllEnvs();
  });

  it("aggregates multiple accounts under a single provider", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const providers = listProviders();
    const anthropic = providers.find((p) => p.id === "anthropic")!;

    expect(anthropic.accounts.length).toBeGreaterThan(1);
    expect(anthropic.aggregateQuotaPercent).toBe(
      Math.round(anthropic.accounts.reduce((sum, a) => sum + a.quotaPercent, 0) / anthropic.accounts.length)
    );
  });

  it("marks a provider offline when its API key is not configured", () => {
    const providers = listProviders();
    const anthropic = providers.find((p) => p.id === "anthropic")!;
    expect(anthropic.status).toBe("offline");
  });

  it("never returns the api key env var value, only presence", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "super-secret-value");
    const providers = listProviders();
    const anthropic = providers.find((p) => p.id === "anthropic")!;
    const serialized = JSON.stringify(anthropic);
    expect(serialized).not.toContain("super-secret-value");
  });

  it("selects a long-context-capable model for a research objective, with an explanation", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const decision = selectModel({ objective: "Research the best architecture for JARVIS" });

    expect(decision).not.toBeNull();
    expect(decision!.classification).toBe("long-context-research");
    expect(decision!.providerId).toBe("anthropic");
    expect(decision!.reason.length).toBeGreaterThan(0);
  });

  it("falls back to the next healthy provider when the first is offline", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key"); // anthropic stays offline (unset)
    const decision = selectModel({ objective: "Implement a new feature" });

    expect(decision).not.toBeNull();
    expect(decision!.providerId).toBe("openai");
  });

  it("returns null when no provider is configured at all", () => {
    const decision = selectModel({ objective: "Do anything" });
    expect(decision).toBeNull();
  });
});
