import { describe, expect, it } from "vitest";
import { followEnvelope, rmsFromTimeDomain, syntheticSpeechLevel } from "./envelope";

describe("followEnvelope", () => {
  it("rises toward the target faster than it falls", () => {
    const up = followEnvelope(0, 1, 0.05);
    const down = followEnvelope(1, 0, 0.05);
    expect(up).toBeGreaterThan(0.5);
    expect(1 - down).toBeLessThan(up);
  });

  it("never leaves 0..1 and is a no-op at dt = 0", () => {
    expect(followEnvelope(0.4, 5, 10)).toBeLessThanOrEqual(1);
    expect(followEnvelope(0.4, -5, 10)).toBeGreaterThanOrEqual(0);
    expect(followEnvelope(0.4, 1, 0)).toBe(0.4);
  });

  it("converges on the target over time", () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = followEnvelope(v, 0.7, 1 / 60);
    expect(v).toBeCloseTo(0.7, 2);
  });
});

describe("rmsFromTimeDomain", () => {
  it("is 0 for silence (all samples centred at 128)", () => {
    expect(rmsFromTimeDomain(new Uint8Array(256).fill(128))).toBe(0);
  });

  it("is ~1 for a full-scale square wave and 0 for empty input", () => {
    const sq = new Uint8Array(256).map((_, i) => (i % 2 === 0 ? 0 : 255));
    expect(rmsFromTimeDomain(sq)).toBeGreaterThan(0.95);
    expect(rmsFromTimeDomain(new Uint8Array(0))).toBe(0);
  });

  it("scales monotonically with amplitude", () => {
    const wave = (amp: number) => new Uint8Array(256).map((_, i) => 128 + (i % 2 === 0 ? amp : -amp));
    expect(rmsFromTimeDomain(wave(10))).toBeLessThan(rmsFromTimeDomain(wave(40)));
  });
});

describe("syntheticSpeechLevel", () => {
  it("stays within 0..1, is deterministic, and actually varies", () => {
    const samples = Array.from({ length: 400 }, (_, i) => syntheticSpeechLevel(i / 100, 7));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.4);
    expect(syntheticSpeechLevel(1.234, 7)).toBe(syntheticSpeechLevel(1.234, 7));
  });

  it("differs between seeds", () => {
    const a = Array.from({ length: 50 }, (_, i) => syntheticSpeechLevel(i / 10, 1));
    const b = Array.from({ length: 50 }, (_, i) => syntheticSpeechLevel(i / 10, 2));
    expect(a).not.toEqual(b);
  });
});
