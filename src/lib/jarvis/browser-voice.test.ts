import { describe, expect, it, vi } from "vitest";
import { pickFemaleVoice } from "./browser-voice";

const v = (name: string, lang = "en-US") => ({ name, lang });

describe("pickFemaleVoice", () => {
  it("prefers a female voice over a male system default", () => {
    const voices = [v("Microsoft David - English (United States)"), v("Microsoft Zira - English (United States)")];
    expect(pickFemaleVoice(voices)?.name).toContain("Zira");
  });

  it("recognises common female voice names and explicit labels", () => {
    expect(pickFemaleVoice([v("Microsoft Aria Online (Natural) - English (United States)")])?.name).toContain("Aria");
    expect(pickFemaleVoice([v("Google UK English Female", "en-GB")])?.name).toContain("Female");
    expect(pickFemaleVoice([v("Samantha")])?.name).toBe("Samantha");
  });

  it("never picks a male voice, even when it is the only English one", () => {
    expect(pickFemaleVoice([v("Microsoft David Desktop"), v("Microsoft Guy Online (Natural)"), v("Alex")])).toBeUndefined();
    expect(pickFemaleVoice([v("Google UK English Male", "en-GB")])).toBeUndefined();
  });

  it("does not mistake 'female' for 'male'", () => {
    expect(pickFemaleVoice([v("Google UK English Female", "en-GB")])).toBeDefined();
  });

  it("only considers voices in the requested language", () => {
    const voices = [v("Microsoft Katja", "de-DE"), v("Microsoft Zira", "en-US")];
    expect(pickFemaleVoice(voices, "en")?.name).toBe("Microsoft Zira");
    expect(pickFemaleVoice(voices, "de")?.name).toBe("Microsoft Katja");
    expect(pickFemaleVoice([v("Microsoft Katja", "de-DE")], "en")).toBeUndefined();
  });

  it("returns undefined for an empty list", () => {
    expect(pickFemaleVoice([])).toBeUndefined();
  });
});

describe("loading the browser's voice list", () => {
  it("asks for the voices as soon as the module loads, because browsers fill the list in late", async () => {
    // Chrome returns an empty list from getVoices() until it has loaded them; asking early means
    // the first spoken line already finds the female voice instead of the male system default.
    const getVoices = vi.fn(() => []);
    vi.stubGlobal("window", { speechSynthesis: { getVoices, addEventListener: vi.fn() } });
    vi.resetModules();

    await import("./browser-voice");

    expect(getVoices).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does nothing, and does not fail, where there is no speech synthesis", async () => {
    vi.stubGlobal("window", {});
    vi.resetModules();
    await expect(import("./browser-voice")).resolves.toBeDefined();
    vi.unstubAllGlobals();
  });
});
