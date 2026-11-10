import { describe, expect, it } from "vitest";
import { isVoiceStudioMain, killPids } from "./process";

describe("isVoiceStudioMain", () => {
  it("is true for the bare executable line (the Electron main process)", () => {
    expect(isVoiceStudioMain('"C:\\Program Files\\VoiceStudio\\VoiceStudio.exe"')).toBe(true);
  });

  it("is false for its renderer, gpu and utility helper processes", () => {
    expect(isVoiceStudioMain('"C:\\Program Files\\VoiceStudio\\VoiceStudio.exe" --type=renderer --lang=en-US')).toBe(false);
    expect(isVoiceStudioMain('"C:\\Program Files\\VoiceStudio\\VoiceStudio.exe" --type=gpu-process')).toBe(false);
  });

  it("is false for an empty command line", () => {
    expect(isVoiceStudioMain("")).toBe(false);
  });
});

describe("killPids", () => {
  it("does nothing for an empty list", async () => {
    await expect(killPids([])).resolves.toBeUndefined();
  });

  it("rejects pids that aren't positive integers", async () => {
    await expect(killPids([-1])).rejects.toThrow(/invalid pid/i);
    await expect(killPids([1.5])).rejects.toThrow(/invalid pid/i);
  });
});
