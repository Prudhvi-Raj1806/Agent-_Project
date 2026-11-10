import { afterEach, describe, expect, it, vi } from "vitest";
import { getDecisionModelAdapter, getLayaConnectionInfo } from "./factory";
import { LayaFallbackAdapter } from "./fallback-adapter";
import { LayaHttpAdapter } from "./http-adapter";

describe("getDecisionModelAdapter / getLayaConnectionInfo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back when LAYA_BASE_URL is unset", () => {
    vi.stubEnv("LAYA_BASE_URL", "");
    expect(getDecisionModelAdapter()).toBeInstanceOf(LayaFallbackAdapter);
    expect(getLayaConnectionInfo()).toEqual({ mode: "fallback" });
  });

  it("uses the real Laya adapter when LAYA_BASE_URL is set", () => {
    vi.stubEnv("LAYA_BASE_URL", "http://127.0.0.1:9999");
    expect(getDecisionModelAdapter()).toBeInstanceOf(LayaHttpAdapter);
    expect(getLayaConnectionInfo()).toEqual({ mode: "laya" });
  });
});
