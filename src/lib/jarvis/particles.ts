/**
 * Particle-sphere math for the JARVIS globe. Pure and deterministic so it
 * can be tested without a canvas; `jarvis-globe.tsx` only draws the result.
 */

export interface SpherePoint {
  x: number;
  y: number;
  z: number;
  /** Stable 0..1 value per point — decorrelates noise and twinkle between points. */
  seed: number;
}

export interface ViewTransform {
  cx: number;
  cy: number;
  /** Pixel radius of the unit sphere. */
  scale: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  /** 0 = far side of the globe, 1 = facing the viewer. */
  depth: number;
  /** Perspective size multiplier (>1 near the viewer). */
  size: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fibonacci-lattice sphere: even coverage, no pole clustering. */
export function generateSphere(count: number, seed = 1337): SpherePoint[] {
  const rand = mulberry32(seed);
  const points: SpherePoint[] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    points.push({ x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring, seed: rand() });
  }
  return points;
}

/**
 * Radius multiplier for one particle at time `t` (seconds) and speech
 * `energy` (0..1). At rest the surface only shimmers; as energy rises the
 * noise amplitude grows and a travelling latitude pulse ripples across it.
 */
export function surfaceRadius(p: SpherePoint, t: number, energy: number): number {
  const e = Math.min(1, Math.max(0, energy));
  const n =
    (Math.sin(p.x * 3.1 + t * 0.7 + p.seed * 6.283) +
      Math.sin(p.y * 4.3 - t * 0.5 + p.seed * 3.1) +
      Math.sin(p.z * 3.7 + t * 0.9 - p.seed * 5)) /
    3;
  const amplitude = 0.015 + 0.2 * e;
  const pulse = Math.sin(p.y * 7 - t * 5) * 0.06 * e;
  return 1 + amplitude * n + pulse;
}

/** Rotate about Y then X, then apply a mild perspective. */
export function projectPoint(
  p: SpherePoint,
  radiusMul: number,
  rotY: number,
  rotX: number,
  view: ViewTransform,
): ProjectedPoint {
  const x0 = p.x * radiusMul;
  const y0 = p.y * radiusMul;
  const z0 = p.z * radiusMul;

  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const x1 = x0 * cy + z0 * sy;
  const z1 = -x0 * sy + z0 * cy;

  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const y2 = y0 * cx - z1 * sx;
  const z2 = y0 * sx + z1 * cx;

  const persp = 1 / (1 - z2 * 0.18);
  return {
    x: view.cx + x1 * view.scale * persp,
    y: view.cy + y2 * view.scale * persp,
    depth: Math.min(1, Math.max(0, (z2 + 1) / 2)),
    size: persp,
  };
}
