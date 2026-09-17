export interface ClapTrackerOptions {
  /** Instant RMS must exceed the rolling noise floor by this multiple to count as a spike. */
  spikeRatio?: number;
  /** Absolute RMS floor — ignores near-silence entirely so a near-zero noise floor can't trivially trip the ratio check. */
  minRms?: number;
  /** Minimum gap between individual spikes, so one loud clap's decay tail isn't counted twice. */
  cooldownMs?: number;
  /** Max gap between the first and second clap to count as a "double clap." */
  doubleClapWindowMs?: number;
  /** EMA smoothing factor for the rolling noise floor, applied only on non-spike samples. */
  noiseFloorAlpha?: number;
}

const DEFAULTS: Required<ClapTrackerOptions> = {
  spikeRatio: 3.0,
  minRms: 0.02,
  cooldownMs: 250,
  doubleClapWindowMs: 700,
  noiseFloorAlpha: 0.02,
};

/**
 * Pure double-clap detector over a stream of RMS samples — no audio capture,
 * no DOM. Kept separate from the Web Audio plumbing (use-clap-detector.ts)
 * specifically so the detection math is unit-testable without a microphone.
 */
export class ClapTracker {
  private readonly opts: Required<ClapTrackerOptions>;
  private noiseFloor: number;
  private lastSpikeAt = -Infinity;
  private firstClapAt = 0;

  constructor(opts: ClapTrackerOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.noiseFloor = this.opts.minRms;
  }

  /** Feed one RMS sample at time `now` (ms, monotonic). Returns true exactly when a double-clap completes. */
  push(rms: number, now: number): boolean {
    const { spikeRatio, minRms, cooldownMs, doubleClapWindowMs, noiseFloorAlpha } = this.opts;
    const isSpike = rms > minRms && rms > this.noiseFloor * spikeRatio && now - this.lastSpikeAt > cooldownMs;

    if (isSpike) {
      this.lastSpikeAt = now;
      if (this.firstClapAt && now - this.firstClapAt <= doubleClapWindowMs) {
        this.firstClapAt = 0;
        return true;
      }
      this.firstClapAt = now;
      return false;
    }

    this.noiseFloor = this.noiseFloor * (1 - noiseFloorAlpha) + rms * noiseFloorAlpha;
    if (this.firstClapAt && now - this.firstClapAt > doubleClapWindowMs) this.firstClapAt = 0;
    return false;
  }
}
