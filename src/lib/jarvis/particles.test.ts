import { describe, expect, it } from "vitest";
import { generateSphere, projectPoint, surfaceRadius } from "./particles";

describe("generateSphere", () => {
  it("returns the requested count of unit-length, deterministic points", () => {
    const a = generateSphere(500, 42);
    const b = generateSphere(500, 42);
    expect(a).toHaveLength(500);
    for (const p of a) expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 5);
    expect(a).toEqual(b);
  });

  it("covers the sphere evenly (no clustering at a pole)", () => {
    const pts = generateSphere(2000, 1);
    const meanZ = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    const north = pts.filter((p) => p.y > 0.9).length;
    const south = pts.filter((p) => p.y < -0.9).length;
    expect(Math.abs(meanZ)).toBeLessThan(0.02);
    expect(Math.abs(north - south)).toBeLessThan(25);
  });
});

describe("surfaceRadius", () => {
  const p = { x: 0.6, y: 0.0, z: 0.8, seed: 0.3 };

  it("stays close to 1 when idle and is bounded when energetic", () => {
    for (let t = 0; t < 20; t += 0.37) {
      expect(Math.abs(surfaceRadius(p, t, 0) - 1)).toBeLessThan(0.08);
      const r = surfaceRadius(p, t, 1);
      expect(r).toBeGreaterThan(0.7);
      expect(r).toBeLessThan(1.4);
    }
  });

  it("moves more with speech energy than at rest", () => {
    const spread = (energy: number) => {
      const rs = Array.from({ length: 200 }, (_, i) => surfaceRadius(p, i * 0.13, energy));
      return Math.max(...rs) - Math.min(...rs);
    };
    expect(spread(1)).toBeGreaterThan(spread(0) * 2);
  });
});

describe("projectPoint", () => {
  it("puts the centre-front point at the canvas centre, near depth 1", () => {
    const r = projectPoint({ x: 0, y: 0, z: 1, seed: 0 }, 1, 0, 0, { cx: 100, cy: 100, scale: 50 });
    expect(r.x).toBeCloseTo(100, 3);
    expect(r.y).toBeCloseTo(100, 3);
    expect(r.depth).toBeGreaterThan(0.9);
  });

  it("gives back-facing points a lower depth than front-facing ones", () => {
    const view = { cx: 0, cy: 0, scale: 50 };
    const front = projectPoint({ x: 0, y: 0, z: 1, seed: 0 }, 1, 0, 0, view);
    const back = projectPoint({ x: 0, y: 0, z: -1, seed: 0 }, 1, 0, 0, view);
    expect(back.depth).toBeLessThan(front.depth);
  });

  it("rotating by pi about Y swaps front and back", () => {
    const view = { cx: 0, cy: 0, scale: 50 };
    const r = projectPoint({ x: 0, y: 0, z: 1, seed: 0 }, 1, Math.PI, 0, view);
    expect(r.depth).toBeLessThan(0.2);
  });
});
