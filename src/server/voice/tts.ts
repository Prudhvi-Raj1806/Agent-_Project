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
 *
 * Settings can pin one provider (`voice.provider`); the chain then contains
 * only that one, and "browser" means no server-side provider at all.
 */

import type { VoiceProvider } from "@/server/settings/schema";

export type SpeechProviderName = "voicestudio" | "elevenlabs";

export interface SynthesizedSpeech {
  audio: Buffer;
  contentType: string;
  provider: SpeechProviderName;
}

/** What the owner chose in Settings: which provider, and which Voice Studio voice. */
export interface VoicePrefs {
  provider: VoiceProvider;
  voice: string;
}

/** The choice when nothing is stored: today's automatic order and the environment's voice. */
export function envVoicePrefs(): VoicePrefs {
  return { provider: "auto", voice: process.env.VOICESTUDIO_VOICE?.trim() || "alloy" };
}

const VOICESTUDIO_DEFAULT_URL = "http://localhost:3900";
const HEALTH_TIMEOUT_MS = 800;
const HEALTH_TTL_MS = 10_000;
const SPEECH_TIMEOUT_MS = 30_000;

export function voiceStudioBaseUrl(): string | null {
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

async function synthesizeWithVoiceStudio(text: string, voice: string): Promise<SynthesizedSpeech | null> {
  const baseUrl = voiceStudioBaseUrl();
  if (!baseUrl || !(await voiceStudioReachable())) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer local" },
      body: JSON.stringify({
        model: "tts-1",
        voice,
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

/**
 * Runs the provider chain; null means "no provider could speak this — use the
 * browser voice". A pinned provider is the whole chain: it never falls through
 * to another paid or local one behind the owner's back.
 */
export async function synthesizeSpeechDetailed(
  text: string,
  prefs: VoicePrefs = envVoicePrefs(),
): Promise<SynthesizedSpeech | null> {
  switch (prefs.provider) {
    case "browser":
      return null;
    case "voicestudio":
      return synthesizeWithVoiceStudio(text, prefs.voice);
    case "elevenlabs":
      return synthesizeWithElevenLabs(text);
    default:
      return (await synthesizeWithVoiceStudio(text, prefs.voice)) ?? (await synthesizeWithElevenLabs(text));
  }
}

/** Audio bytes only — kept for callers that don't care which provider answered. */
export async function synthesizeSpeech(text: string, prefs?: VoicePrefs): Promise<Buffer | null> {
  return (await synthesizeSpeechDetailed(text, prefs))?.audio ?? null;
}

/** Which voice a line would come out in right now, given the choice and what is actually up. */
export function effectiveSpeechProvider(
  choice: VoiceProvider,
  available: { voicestudio: boolean; elevenlabs: boolean },
): SpeechProviderName | "browser" {
  if (choice === "browser") return "browser";
  if (choice === "voicestudio") return available.voicestudio ? "voicestudio" : "browser";
  if (choice === "elevenlabs") return available.elevenlabs ? "elevenlabs" : "browser";
  return available.voicestudio ? "voicestudio" : available.elevenlabs ? "elevenlabs" : "browser";
}
