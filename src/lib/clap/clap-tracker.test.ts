import { describe, expect, it } from "vitest";
import { ClapTracker } from "./clap-tracker";

const QUIET = 0.005;
const CLAP = 0.4;

describe("ClapTracker", () => {
  it("does not trigger on ambient quiet alone", () => {
    const tracker = new ClapTracker();
    let triggered = false;
    for (let t = 0; t < 2000; t += 20) {
      triggered ||= tracker.push(QUIET, t);
    }
    expect(triggered).toBe(false);
  });

  it("does not trigger on a single isolated clap", () => {
    const tracker = new ClapTracker();
    let t = 0;
    for (; t < 500; t += 20) tracker.push(QUIET, t);
    expect(tracker.push(CLAP, t)).toBe(false);
    for (t += 20; t < 3000; t += 20) {
      expect(tracker.push(QUIET, t)).toBe(false);
    }
  });

  it("triggers on two claps within the double-clap window", () => {
    const tracker = new ClapTracker({ doubleClapWindowMs: 700, cooldownMs: 250 });
    let t = 0;
    for (; t < 500; t += 20) tracker.push(QUIET, t);
    expect(tracker.push(CLAP, t)).toBe(false); // first clap
    t += 300; // well past cooldown, well within the double-clap window
    expect(tracker.push(CLAP, t)).toBe(true); // second clap completes it
  });

  it("does not trigger when the second clap arrives after the double-clap window", () => {
    const tracker = new ClapTracker({ doubleClapWindowMs: 700, cooldownMs: 250 });
    let t = 0;
    for (; t < 500; t += 20) tracker.push(QUIET, t);
    expect(tracker.push(CLAP, t)).toBe(false);
    t += 900; // outside the 700ms window
    expect(tracker.push(CLAP, t)).toBe(false); // treated as a fresh "first clap" instead
    t += 300;
    expect(tracker.push(CLAP, t)).toBe(true); // now it completes against that new first clap
  });

  it("collapses a clap's decay tail (rapid re-spikes within cooldown) into one clap", () => {
    const tracker = new ClapTracker({ cooldownMs: 250, doubleClapWindowMs: 700 });
    let t = 0;
    for (; t < 500; t += 20) tracker.push(QUIET, t);
    expect(tracker.push(CLAP, t)).toBe(false); // clap 1
    t += 50; // inside cooldown — decay tail, not a second clap
    expect(tracker.push(CLAP * 0.8, t)).toBe(false);
    t += 50;
    expect(tracker.push(CLAP * 0.6, t)).toBe(false);
    t += 300; // now past cooldown and still within the double-clap window
    expect(tracker.push(CLAP, t)).toBe(true); // this is the real second clap
  });

  it("ignores a gradually loud but non-spiky background (e.g. music) once the noise floor adapts", () => {
    const tracker = new ClapTracker();
    let triggered = false;
    // A steady moderate level should raise the noise floor over time rather than reading as claps.
    for (let t = 0; t < 5000; t += 20) {
      triggered ||= tracker.push(0.05, t);
    }
    expect(triggered).toBe(false);
  });
});
