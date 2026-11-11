import { describe, expect, it, vi } from "vitest";
import {
  MAX_SPOKEN_CHARS,
  PLAY_AUDIO_SCRIPT,
  SPEAK_TEXT_SCRIPT,
  speakOnPc,
  stopPcSpeech,
  type PcPlaybackDeps,
} from "./pc-playback";

type RunScript = PcPlaybackDeps["runScript"];

function deps(over: Partial<PcPlaybackDeps> = {}) {
  return {
    platform: "win32",
    synthesize: async () => null,
    saveTemp: vi.fn(async (_audio: Buffer, extension: string) => `C:\\tmp\\line${extension}`),
    removeTemp: vi.fn(async () => {}),
    runScript: vi.fn<RunScript>(async () => 0),
    ...over,
  } as PcPlaybackDeps & {
    saveTemp: ReturnType<typeof vi.fn>;
    removeTemp: ReturnType<typeof vi.fn>;
    runScript: ReturnType<typeof vi.fn<RunScript>>;
  };
}

const audio = (provider: "voicestudio" | "elevenlabs", contentType = "audio/mpeg") => async () => ({
  audio: Buffer.from("bytes"),
  contentType,
  provider,
});

/** A script that only finishes when it is told to stop. */
const hangUntilAborted: RunScript = (_script, _env, signal) =>
  new Promise((resolve) => signal.addEventListener("abort", () => resolve(1)));

describe("speaking on the PC", () => {
  it("is refused on anything but Windows, without running anything", async () => {
    const d = deps({ platform: "linux" });
    expect(await speakOnPc("hello", d)).toEqual({ ok: false, reason: "unsupported" });
    expect(d.runScript).not.toHaveBeenCalled();
  });

  it("plays the provider's audio from a temp file, then removes the file", async () => {
    const d = deps({ synthesize: audio("voicestudio") });
    expect(await speakOnPc("hello", d)).toEqual({ ok: true, provider: "voicestudio" });
    expect(d.runScript).toHaveBeenCalledTimes(1);
    const [script, env] = d.runScript.mock.calls[0];
    expect(script).toBe(PLAY_AUDIO_SCRIPT);
    expect(env).toEqual({ VEDA_AUDIO_FILE: "C:\\tmp\\line.mp3" });
    expect(d.removeTemp).toHaveBeenCalledWith("C:\\tmp\\line.mp3");
  });

  it("names the temp file after the audio type", async () => {
    const d = deps({ synthesize: audio("voicestudio", "audio/wav") });
    await speakOnPc("hello", d);
    expect(d.runScript.mock.calls[0][1]).toEqual({ VEDA_AUDIO_FILE: "C:\\tmp\\line.wav" });
  });

  it("uses Windows' own voice when no provider can speak", async () => {
    const d = deps();
    expect(await speakOnPc("  Good evening, café.  ", d)).toEqual({ ok: true, provider: "system" });
    const [script, env] = d.runScript.mock.calls[0];
    expect(script).toBe(SPEAK_TEXT_SCRIPT);
    expect(Buffer.from(env.VEDA_SPEECH_TEXT, "base64").toString("utf8")).toBe("Good evening, café.");
  });

  it("asks Windows for a female voice, since its default is often male", () => {
    expect(SPEAK_TEXT_SCRIPT).toContain("SelectVoiceByHints");
    expect(SPEAK_TEXT_SCRIPT).toContain("VoiceGender]::Female");
    expect(SPEAK_TEXT_SCRIPT.indexOf("SelectVoiceByHints")).toBeLessThan(SPEAK_TEXT_SCRIPT.indexOf("$s.Speak"));
  });

  it("falls back to Windows' voice when the audio can't be played, and still cleans up", async () => {
    const d = deps({ synthesize: audio("elevenlabs") });
    d.runScript.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    expect(await speakOnPc("hello", d)).toEqual({ ok: true, provider: "system" });
    expect(d.runScript.mock.calls.map(([s]) => s)).toEqual([PLAY_AUDIO_SCRIPT, SPEAK_TEXT_SCRIPT]);
    expect(d.removeTemp).toHaveBeenCalledTimes(1);
  });

  it("reports failure when even the built-in voice fails", async () => {
    const d = deps();
    d.runScript.mockResolvedValue(1);
    expect(await speakOnPc("hello", d)).toEqual({ ok: false, reason: "failed" });
  });

  it("never puts the spoken text into the script, whatever it contains", async () => {
    const d = deps();
    const hostile = `"; Remove-Item -Recurse C:\\ ; $(calc) \` '`;
    await speakOnPc(hostile, d);
    const [script, env] = d.runScript.mock.calls[0];
    expect(script).toBe(SPEAK_TEXT_SCRIPT);
    expect(script).not.toContain("Remove-Item");
    expect(Buffer.from(env.VEDA_SPEECH_TEXT, "base64").toString("utf8")).toBe(hostile);
  });

  it("caps a very long line and refuses an empty one", async () => {
    const d = deps();
    await speakOnPc("a".repeat(MAX_SPOKEN_CHARS + 500), d);
    expect(Buffer.from(d.runScript.mock.calls[0][1].VEDA_SPEECH_TEXT, "base64").length).toBe(MAX_SPOKEN_CHARS);
    expect(await speakOnPc("   ", d)).toEqual({ ok: false, reason: "failed" });
  });

  it("stopPcSpeech cuts the current line off", async () => {
    const d = deps({ runScript: vi.fn<RunScript>(hangUntilAborted) });
    const pending = speakOnPc("a long line", d);
    await vi.waitFor(() => expect(d.runScript).toHaveBeenCalled());
    expect(stopPcSpeech()).toBe(true);
    expect(await pending).toEqual({ ok: false, reason: "stopped" });
    expect(stopPcSpeech()).toBe(false);
  });

  it("a newer line replaces the one still playing", async () => {
    const first = deps({ runScript: vi.fn<RunScript>(hangUntilAborted) });
    const pending = speakOnPc("first", first);
    await vi.waitFor(() => expect(first.runScript).toHaveBeenCalled());
    expect(await speakOnPc("second", deps())).toEqual({ ok: true, provider: "system" });
    expect(await pending).toEqual({ ok: false, reason: "stopped" });
  });
});
