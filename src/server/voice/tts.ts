/**
 * Speech synthesis for Jarvis, as an ordered provider chain:
 *
 *   1. VoiceStudio  — local, free, private. Used whenever its desktop app is
 *                     open (it serves an OpenAI-compatible API on port 3900).
 *   2. ElevenLabs   — cloud, used when a key + voice are configured.
 *   3. (none)       — returns null and the client falls back to the
 *                     browser's built-in SpeechSynthesis.
 *
 * Nothing here ever blocks speech on a provider the user hasn't set up or
 * hasn't started: an unreachable provider is skipped, not an error.
 */

export type SpeechProviderName = "voicestudio" | "elevenlabs";

export interface SynthesizedSpeech {
  audio: Buffer;
  contentType: string;
  provider: SpeechProviderName;
}

const VOICESTUDIO_DEFAULT_URL = "http://localhost:3900";
const HEALTH_TIMEOUT_MS = 800;
const HEALTH_TTL_MS = 10_000;
const SPEECH_TIMEOUT_MS = 30_000;

function voiceStudioBaseUrl(): string | null {
  const configured = process.env.VOICESTUDIO_URL?.trim();
  if (configured?.toLowerCase() === "off") return null;
  return (configured || VOICESTUDIO_DEFAULT_URL).replace(/\/+$/, "");
}

let healthCache: { at: number; baseUrl: string; ok: boolean } | null = null;

export function resetVoiceStudioHealthCache(): void {
  healthCache = null;
}

/**
 * Is the VoiceStudio app up? Cached briefly either way, so a closed app costs
 * one short probe per ten seconds — not a timeout on every spoken line.
 */
export async function voiceStudioReachable(): Promise<boolean> {
  const baseUrl = voiceStudioBaseUrl();
  if (!baseUrl) return false;
  const now = Date.now();
  if (healthCache && healthCache.baseUrl === baseUrl && now - healthCache.at < HEALTH_TTL_MS) {
    return healthCache.ok;
  }
  let ok = false;
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  healthCache = { at: now, baseUrl, ok };
  return ok;
}

async function synthesizeWithVoiceStudio(text: string): Promise<SynthesizedSpeech | null> {
  const baseUrl = voiceStudioBaseUrl();
  if (!baseUrl || !(await voiceStudioReachable())) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer local" },
      body: JSON.stringify({
        model: "tts-1",
        voice: process.env.VOICESTUDIO_VOICE?.trim() || "alloy",
        input: text,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return {
      audio: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("Content-Type") || "audio/mpeg",
      provider: "voicestudio",
    };
  } catch {
    return null;
  }
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}

async function synthesizeWithElevenLabs(text: string): Promise<SynthesizedSpeech | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) return null;

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: "eleven_monolingual_v1" }),
    });
    if (!res.ok) return null;
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg", provider: "elevenlabs" };
  } catch {
    return null;
  }
}

/** Runs the provider chain; null means "no provider could speak this — use the browser voice". */
export async function synthesizeSpeechDetailed(text: string): Promise<SynthesizedSpeech | null> {
  return (await synthesizeWithVoiceStudio(text)) ?? (await synthesizeWithElevenLabs(text));
}

/** Audio bytes only — kept for callers that don't care which provider answered. */
export async function synthesizeSpeech(text: string): Promise<Buffer | null> {
  return (await synthesizeSpeechDetailed(text))?.audio ?? null;
}
