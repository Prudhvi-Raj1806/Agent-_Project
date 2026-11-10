import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetVoiceStudioHealthCache, synthesizeSpeechDetailed, voiceStudioReachable } from "./tts";

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
});
