import { describe, expect, it } from "vitest";
import { LayaFallbackAdapter } from "./fallback-adapter";

describe("LayaFallbackAdapter", () => {
  it("reports mode 'fallback', always degraded, and never gates on a real decision", async () => {
    const adapter = new LayaFallbackAdapter();
    expect(adapter.mode).toBe("fallback");
    expect(await adapter.health()).toEqual({ status: "degraded" });
    expect(await adapter.classify({ state: "anything", question: "urgency", schema: ["low", "medium", "high"] })).toEqual({
      decision: "unknown",
      confidence: 0,
    });
  });
});
