import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectiveSpeechProvider,
  resetVoiceStudioHealthCache,
  synthesizeSpeechDetailed,
  voiceStudioReachable,
} from "./tts";

const bytes = (s: string) => new TextEncoder().encode(s).buffer;

function audioResponse(body: string, type = "audio/mpeg") {
  return new Response(bytes(body), { status: 200, headers: { "Content-Type": type } });
}

describe("speech provider chain", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VOICESTUDIO_URL", "");
    vi.stubEnv("KOKORO_URL", "off");
    vi.stubEnv("VOICESTUDIO_VOICE", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "");
    resetVoiceStudioHealthCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses VoiceStudio first when its app is up, and never touches ElevenLabs", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "v");
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/health") ? new Response('{"status":"ok"}') : audioResponse("vs-audio"),
    );

    const out = await synthesizeSpeechDetailed("hello");
    expect(out?.provider).toBe("voicestudio");
    expect(Buffer.from(out!.audio).toString()).toBe("vs-audio");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("elevenlabs"))).toBe(false);

    const speechCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/v1/audio/speech"))!;
    expect(String(speechCall[0])).toBe("http://localhost:3900/v1/audio/speech");
    const body = JSON.parse(speechCall[1].body);
    expect(body).toMatchObject({ input: "hello", model: "tts-1", voice: "alloy", response_format: "mp3" });
  });

  it("passes the configured voice profile id through", async () => {
    vi.stubEnv("VOICESTUDIO_VOICE", "profile-123");
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/health") ? new Response("{}") : audioResponse("x"),
    );
    await synthesizeSpeechDetailed("hi");
    const speechCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/v1/audio/speech"))!;
    expect(JSON.parse(speechCall[1].body).voice).toBe("profile-123");
  });

  it("falls through to ElevenLabs when VoiceStudio isn't running", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "v");
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith("http://localhost:3900")) throw new Error("ECONNREFUSED");
      return audioResponse("el-audio");
    });

    const out = await synthesizeSpeechDetailed("hello");
    expect(out?.provider).toBe("elevenlabs");
    expect(Buffer.from(out!.audio).toString()).toBe("el-audio");
  });

  it("falls through when VoiceStudio is up but synthesis fails", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "v");
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/health")) return new Response("{}");
      if (String(url).includes("localhost:3900")) return new Response("boom", { status: 500 });
      return audioResponse("el-audio");
    });
    expect((await synthesizeSpeechDetailed("hello"))?.provider).toBe("elevenlabs");
  });

  it("returns null (so the client uses the browser voice) when nothing is available", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    expect(await synthesizeSpeechDetailed("hello")).toBeNull();
  });

  it("can be switched off with VOICESTUDIO_URL=off", async () => {
    vi.stubEnv("VOICESTUDIO_URL", "off");
    expect(await synthesizeSpeechDetailed("hello")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("remembers a failed health check briefly instead of paying the timeout on every line", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    expect(await voiceStudioReachable()).toBe(false);
    expect(await voiceStudioReachable()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("with a chosen provider", () => {
    const bothUp = () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "k");
      vi.stubEnv("ELEVENLABS_VOICE_ID", "v");
      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).endsWith("/health")) return new Response("{}");
        return audioResponse(String(url).includes("elevenlabs") ? "el-audio" : "vs-audio");
      });
    };
    const touched = (part: string) => fetchMock.mock.calls.some(([u]) => String(u).includes(part));

    it("elevenlabs: never contacts VoiceStudio, even when it is running", async () => {
      bothUp();
      const out = await synthesizeSpeechDetailed("hello", { provider: "elevenlabs", voice: "alloy", kokoroVoice: "af_heart" });
      expect(out?.provider).toBe("elevenlabs");
      expect(touched("localhost:3900")).toBe(false);
    });

    it("voicestudio: does not fall through to ElevenLabs when VoiceStudio is down", async () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "k");
      vi.stubEnv("ELEVENLABS_VOICE_ID", "v");
      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).includes("localhost:3900")) throw new Error("ECONNREFUSED");
        return audioResponse("el-audio");
      });
      expect(await synthesizeSpeechDetailed("hello", { provider: "voicestudio", voice: "alloy", kokoroVoice: "af_heart" })).toBeNull();
      expect(touched("elevenlabs")).toBe(false);
    });

    it("browser: returns null without contacting any provider", async () => {
      bothUp();
      expect(await synthesizeSpeechDetailed("hello", { provider: "browser", voice: "alloy", kokoroVoice: "af_heart" })).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends the chosen voice to VoiceStudio instead of the environment's", async () => {
      vi.stubEnv("VOICESTUDIO_VOICE", "from-env");
      bothUp();
      await synthesizeSpeechDetailed("hi", { provider: "auto", voice: "Chosen Voice", kokoroVoice: "af_heart" });
      const speechCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/v1/audio/speech"))!;
      expect(JSON.parse(speechCall[1].body).voice).toBe("Chosen Voice");
    });
  });

  describe("with Kokoro running", () => {
    const touched = (part: string) => fetchMock.mock.calls.some(([u]) => String(u).includes(part));
    const allUp = () => {
      vi.stubEnv("KOKORO_URL", "http://127.0.0.1:8880");
      vi.stubEnv("ELEVENLABS_API_KEY", "k");
      vi.stubEnv("ELEVENLABS_VOICE_ID", "v");
      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).endsWith("/health")) return new Response("{}");
        const who = String(url).includes("8880") ? "kokoro-audio" : String(url).includes("3900") ? "vs-audio" : "el-audio";
        return audioResponse(who, who === "kokoro-audio" ? "audio/wav" : "audio/mpeg");
      });
    };

    it("auto speaks with Kokoro first and never touches the others", async () => {
      allUp();
      const out = await synthesizeSpeechDetailed("hello", { provider: "auto", voice: "alloy", kokoroVoice: "bm_george" });
      expect(out?.provider).toBe("kokoro");
      expect(out?.contentType).toBe("audio/wav");
      expect(touched("3900")).toBe(false);
      expect(touched("elevenlabs")).toBe(false);
      const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/v1/audio/speech"))!;
      expect(String(call[0])).toBe("http://127.0.0.1:8880/v1/audio/speech");
      expect(JSON.parse(call[1].body)).toMatchObject({ input: "hello", voice: "bm_george", response_format: "wav" });
    });

    it("auto falls through to Voice Studio when Kokoro is down", async () => {
      allUp();
      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).includes("8880")) throw new Error("ECONNREFUSED");
        return String(url).endsWith("/health") ? new Response("{}") : audioResponse("vs-audio");
      });
      expect((await synthesizeSpeechDetailed("hello", { provider: "auto", voice: "alloy", kokoroVoice: "af_heart" }))?.provider).toBe(
        "voicestudio",
      );
    });

    it("kokoro pinned: does not fall through when Kokoro fails", async () => {
      allUp();
      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).includes("8880")) throw new Error("ECONNREFUSED");
        return audioResponse("other");
      });
      expect(await synthesizeSpeechDetailed("hello", { provider: "kokoro", voice: "alloy", kokoroVoice: "af_heart" })).toBeNull();
      expect(touched("3900")).toBe(false);
      expect(touched("elevenlabs")).toBe(false);
    });

    it("voicestudio pinned: never contacts Kokoro", async () => {
      allUp();
      const out = await synthesizeSpeechDetailed("hello", { provider: "voicestudio", voice: "alloy", kokoroVoice: "af_heart" });
      expect(out?.provider).toBe("voicestudio");
      expect(touched("8880")).toBe(false);
    });
  });

  describe("effectiveSpeechProvider", () => {
    const state = (voicestudio: boolean, elevenlabs: boolean, kokoro = false) => ({ kokoro, voicestudio, elevenlabs });

    it("auto prefers Kokoro, then VoiceStudio, then ElevenLabs, then the browser", () => {
      expect(effectiveSpeechProvider("auto", state(true, true, true))).toBe("kokoro");
      expect(effectiveSpeechProvider("kokoro", state(true, true, false))).toBe("browser");
      expect(effectiveSpeechProvider("kokoro", state(false, false, true))).toBe("kokoro");
      expect(effectiveSpeechProvider("auto", state(true, true))).toBe("voicestudio");
      expect(effectiveSpeechProvider("auto", state(false, true))).toBe("elevenlabs");
      expect(effectiveSpeechProvider("auto", state(false, false))).toBe("browser");
    });

    it("a chosen provider that is unavailable means the browser speaks", () => {
      expect(effectiveSpeechProvider("voicestudio", state(false, true))).toBe("browser");
      expect(effectiveSpeechProvider("elevenlabs", state(true, false))).toBe("browser");
      expect(effectiveSpeechProvider("elevenlabs", state(true, true))).toBe("elevenlabs");
      expect(effectiveSpeechProvider("browser", state(true, true))).toBe("browser");
    });
  });
});
