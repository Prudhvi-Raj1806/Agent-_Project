"use client";

import { useEffect, useRef } from "react";
import { generateSphere, makeRotation, projectInto, surfaceRadius } from "@/lib/jarvis/particles";
import type { JarvisVoiceState } from "@/lib/jarvis/use-jarvis-voice";
import { BRAND } from "@/lib/brand";

const PARTICLE_COUNT = 5200;
const ALPHA_BUCKETS = 8;

// The globe is the heaviest thing on the page, so it only draws as often as it
// needs to: resting rotation is slow enough that 20 fps looks continuous, and
// speech gets a smoother 36 fps. It also stops entirely while off-screen.
const IDLE_FPS = 20;
const ACTIVE_FPS = 36;
const MAX_DPR = 1.5;

// White with a cool cast at rest, easing toward the accent cyan (#67d9ff) as
// Jarvis speaks — the same hue the rest of the HUD uses.
const REST_RGB: [number, number, number] = [214, 236, 246];
const ACTIVE_RGB: [number, number, number] = [103, 217, 255];

interface JarvisGlobeProps {
  /** Live 0..1 speech energy; read every frame without re-rendering. */
  levelRef: React.RefObject<number>;
  state: JarvisVoiceState;
  className?: string;
}

/**
 * The particle globe. A Fibonacci-lattice sphere drawn to a 2D canvas:
 * a bright silhouette rim, a sparse dim interior, and a ragged outer cloud
 * that billows with speech energy. All geometry comes from
 * `lib/jarvis/particles` — this component only owns the draw loop.
 */
export function JarvisGlobe({ levelRef, state, className }: JarvisGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const points = generateSphere(PARTICLE_COUNT, 20260926);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let rotY = 0.6;
    let rotX = 0.28;
    let displayEnergy = 0;
    let last = performance.now();
    let lastDraw = 0;
    let visible = true;
    const t0 = last;

    // Reused every frame — no per-frame allocation or garbage collection.
    const bucketData = Array.from({ length: ALPHA_BUCKETS }, () => new Float32Array(PARTICLE_COUNT * 3));
    const bucketLen = new Int32Array(ALPHA_BUCKETS);
    const proj = new Float32Array(4);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const frame = (now: number) => {
      const phase = stateRef.current;
      const minInterval = 1000 / (phase === "idle" ? IDLE_FPS : ACTIVE_FPS);
      if (!visible) return; // restarted by the visibility observer
      if (now - lastDraw < minInterval - 2) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastDraw = now;

      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;

      const rawLevel = levelRef.current ?? 0;
      const level = reduceMotion ? rawLevel * 0.4 : rawLevel;
      // Thinking has no audio, so give it a slow, steady swell of its own.
      const thinkingSwell = phase === "thinking" ? 0.16 + 0.08 * Math.sin(t * 3.2) : 0;
      const targetEnergy = Math.max(level, thinkingSwell);
      displayEnergy += (targetEnergy - displayEnergy) * Math.min(1, dt * 12);

      const spin = reduceMotion ? 0 : phase === "thinking" ? 0.5 : phase === "speaking" ? 0.22 : 0.1;
      rotY += dt * (spin + displayEnergy * 0.25);
      rotX = 0.28 + Math.sin(t * 0.18) * 0.07;

      ctx.clearRect(0, 0, width, height);
      const radius = Math.min(width, height) * 0.38;
      const view = { cx: width / 2, cy: height / 2, scale: radius };

      // Soft core glow that breathes with energy.
      const glow = ctx.createRadialGradient(view.cx, view.cy, radius * 0.2, view.cx, view.cy, radius * 1.45);
      const glowAlpha = 0.05 + displayEnergy * 0.22;
      glow.addColorStop(0, `rgba(${ACTIVE_RGB.join(",")},${glowAlpha * 0.35})`);
      glow.addColorStop(0.55, `rgba(${ACTIVE_RGB.join(",")},${glowAlpha * 0.5})`);
      glow.addColorStop(1, `rgba(${ACTIVE_RGB.join(",")},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      bucketLen.fill(0);
      const rot = makeRotation(rotY, rotX);

      for (const p of points) {
        // The ragged outer cloud: a minority of particles drift off the surface,
        // further the louder Jarvis is.
        const stray = p.seed > 0.9 ? (p.seed - 0.9) * 10 : 0;
        const radiusMul = surfaceRadius(p, t, displayEnergy) + stray * (0.05 + displayEnergy * 0.28);
        projectInto(proj, p, radiusMul, rot, view);
        const depth = proj[2];

        // Silhouette rim is brightest; the facing and far sides stay dim.
        const rim = 1 - Math.abs(depth * 2 - 1);
        const rimGlow = Math.pow(rim, 2.4);
        const side = depth > 0.5 ? 1 : 0.55;
        const twinkle = 0.85 + 0.15 * Math.sin(t * 2 + p.seed * 40);
        const brightness = Math.min(1, (0.26 + 0.9 * rimGlow + displayEnergy * 0.25 * rim) * side * twinkle);

        const bucket = Math.min(ALPHA_BUCKETS - 1, Math.floor(brightness * ALPHA_BUCKETS));
        const size = (0.95 + rimGlow * 1.5 + stray * 0.3) * proj[3];
        const data = bucketData[bucket];
        const at = bucketLen[bucket];
        data[at] = proj[0];
        data[at + 1] = proj[1];
        data[at + 2] = size;
        bucketLen[bucket] = at + 3;
      }

      const mix = Math.min(1, displayEnergy * 1.6);
      const rgb = REST_RGB.map((c, i) => Math.round(c + (ACTIVE_RGB[i] - c) * mix));
      for (let b = 0; b < ALPHA_BUCKETS; b++) {
        const list = bucketData[b];
        const used = bucketLen[b];
        if (used === 0) continue;
        const alpha = (b + 1) / ALPHA_BUCKETS;
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
        ctx.beginPath();
        for (let i = 0; i < used; i += 3) {
          const s = list[i + 2];
          ctx.rect(list[i] - s / 2, list[i + 1] - s / 2, s, s);
        }
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Stop drawing while the canvas is off-screen or the tab is hidden.
    const setVisible = (next: boolean) => {
      if (next === visible) return;
      visible = next;
      if (visible) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
      }
    };
    const intersection = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setVisible(entry.isIntersecting && !document.hidden);
    });
    intersection.observe(canvas);
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [levelRef]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={`${BRAND}, shown as a sphere of particles that moves while ${BRAND} speaks`}
    />
  );
}
