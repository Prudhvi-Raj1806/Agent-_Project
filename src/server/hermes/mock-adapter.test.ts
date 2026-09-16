import { describe, expect, it } from "vitest";
import type { RoutingDecision } from "@/server/omnirouter/types";
import { HermesMockAdapter } from "./mock-adapter";

const routing: RoutingDecision = {
  providerId: "anthropic",
  providerName: "Anthropic",
  accountId: "anthropic-personal",
  accountLabel: "Personal",
  modelId: "claude-sonnet",
  modelName: "Claude Sonnet",
  classification: "coding",
  reason: ["test"],
};

describe("HermesMockAdapter", () => {
  it("reports mode 'mock' and clearly labels its output as simulated", async () => {
    const adapter = new HermesMockAdapter();
    expect(adapter.mode).toBe("mock");

    const result = await adapter.execute(
      { missionId: "mission-1", objective: "Build a widget", routing },
      { signal: new AbortController().signal, onProgress: () => {} }
    );

    expect(result.success).toBe(true);
    expect(result.source).toBe("mock");
    expect(result.output.toLowerCase()).toContain("mock");
  });

  it("reports monotonically increasing progress up to 100", async () => {
    const adapter = new HermesMockAdapter();
    const progressValues: number[] = [];

    await adapter.execute(
      { missionId: "mission-1", objective: "Build a widget", routing },
      { signal: new AbortController().signal, onProgress: (percent) => progressValues.push(percent) }
    );

    expect(progressValues.at(-1)).toBe(100);
    expect([...progressValues].sort((a, b) => a - b)).toEqual(progressValues);
  });

  it("resumes from fromPercent instead of restarting at 0", async () => {
    const adapter = new HermesMockAdapter();
    const progressValues: number[] = [];

    await adapter.execute(
      { missionId: "mission-1", objective: "Build a widget", routing, fromPercent: 60 },
      { signal: new AbortController().signal, onProgress: (percent) => progressValues.push(percent) }
    );

    expect(progressValues[0]).toBeGreaterThan(60);
    expect(progressValues.at(-1)).toBe(100);
  });

  it("aborts and throws when the signal is cancelled (pause/cancel)", async () => {
    const adapter = new HermesMockAdapter();
    const controller = new AbortController();
    const promise = adapter.execute(
      { missionId: "mission-1", objective: "Build a widget", routing },
      { signal: controller.signal, onProgress: () => {} }
    );

    controller.abort();

    await expect(promise).rejects.toThrow();
  });
});
