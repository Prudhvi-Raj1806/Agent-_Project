/**
 * Speech-level signal helpers for the JARVIS globe. Pure functions: the
 * audio plumbing lives in `use-jarvis-voice.ts`, this only shapes numbers.
 */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * One step of an attack/release envelope follower. Rises quickly (so the
 * globe reacts the instant a syllable lands) and decays slowly (so it
 * settles instead of flickering). Always returns a value in 0..1.
 */
export function followEnvelope(
  current: number,
  target: number,
  dtSec: number,
  attackSec = 0.05,
  releaseSec = 0.4,
): number {
  if (dtSec <= 0) return current;
  const t = clamp01(target);
  const tau = t > current ? attackSec : releaseSec;
  const alpha = 1 - Math.exp(-dtSec / tau);
  return clamp01(current + (t - current) * alpha);
}

/**
 * Loudness of an AnalyserNode time-domain frame (bytes centred on 128),
 * mapped to 0..1. Speech sits around 0.05–0.3 RMS, so a gain of 3 puts
 * normal speech in the upper half of the range without clipping quiet
 * passages.
 */
export function rmsFromTimeDomain(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] - 128) / 128;
    sum += v * v;
  }
  return clamp01(Math.sqrt(sum / samples.length) * 3);
}

function hash01(n: number, seed: number): number {
  let x = (Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0x27d4eb2f) >>> 0;
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

const SYLLABLES_PER_SECOND = 4.2;

/**
 * A speech-shaped envelope with no audio behind it: syllable-rate bumps with
 * random per-syllable weight and occasional word gaps. Used only when the
 * browser's built-in voice is speaking (SpeechSynthesis exposes no audio to
 * tap), so the globe still moves in rhythm with "something being said".
 */
export function syntheticSpeechLevel(tSec: number, seed: number): number {
  const phase = Math.max(0, tSec) * SYLLABLES_PER_SECOND;
  const index = Math.floor(phase);
  const frac = phase - index;
  const bump = Math.sin(Math.PI * frac);
  const weight = 0.35 + 0.65 * hash01(index, seed);
  const gap = hash01(index + 7919, seed) < 0.12 ? 0.15 : 1;
  return clamp01(bump * weight * gap);
}
