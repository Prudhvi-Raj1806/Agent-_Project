/**
 * Speech synthesis for Jarvis, as an ordered provider chain:
 *
 *   1. Kokoro       — local, free, private, light (82M model, CPU). Used
 *                     whenever its small server is running (port 8880).
 *   2. VoiceStudio  — local, free, private. Used whenever its desktop app is
 *                     open (it serves an OpenAI-compatible API on port 3900).
 *   3. ElevenLabs   — cloud, used when a key + voice are configured.
 *   4. (none)       — returns null and the client falls back to the
 *                     browser's built-in SpeechSynthesis.
 *
 * Nothing here ever blocks speech on a provider the user hasn't set up or
 * hasn't started: an unreachable provider is skipped, not an error.
 *
 * Settings can pin one provider (`voice.provider`); the chain then contains
 * only that one, and "browser" means no server-side provider at all.
 */

import type { VoiceProvider } from "@/server/settings/schema";

export type SpeechProviderName = "kokoro" | "voicestudio" | "elevenlabs";

export interface SynthesizedSpeech {
  audio: Buffer;
  contentType: string;
  provider: SpeechProviderName;
}

/** What the owner chose in Settings: which provider, and which voice each local engine uses. */
export interface VoicePrefs {
  provider: VoiceProvider;
  /** Voice Studio profile id, profile name or preset. */
  voice: string;
  /** Kokoro voice id, for example af_heart. */
  kokoroVoice: string;
}

/** The choice when nothing is stored: today's automatic order and the environment's voice. */
export function envVoicePrefs(): VoicePrefs {
  return { provider: "auto", voice: process.env.VOICESTUDIO_VOICE?.trim() || "alloy", kokoroVoice: "af_heart" };
}

const VOICESTUDIO_DEFAULT_URL = "http://localhost:3900";
const HEALTH_TIMEOUT_MS = 800;
const HEALTH_TTL_UP_MS = 10_000;
/** A miss expires fast, so an engine that was just started (or a slow first probe) is noticed within seconds. */
const HEALTH_TTL_DOWN_MS = 3_000;
const SPEECH_TIMEOUT_MS = 30_000;

export function voiceStudioBaseUrl(): string | null {
  const configured = process.env.VOICESTUDIO_URL?.trim();
  if (configured?.toLowerCase() === "off") return null;
  return (configured || VOICESTUDIO_DEFAULT_URL).replace(/\/+$/, "");
}

const KOKORO_DEFAULT_URL = "http://127.0.0.1:8880";

/** Where the local Kokoro server listens; null when switched off with KOKORO_URL=off. */
export function kokoroBaseUrl(): string | null {
  const configured = process.env.KOKORO_URL?.trim();
  if (configured?.toLowerCase() === "off") return null;
  return (configured || KOKORO_DEFAULT_URL).replace(/\/+$/, "");
}

const healthCache = new Map<string, { at: number; ok: boolean }>();

export function resetVoiceStudioHealthCache(): void {
  healthCache.clear();
}

/** Is a local speech server answering /health? Cached briefly either way. */
async function reachable(baseUrl: string | null): Promise<boolean> {
  if (!baseUrl) return false;
  const now = Date.now();
  const cached = healthCache.get(baseUrl);
  if (cached && now - cached.at < (cached.ok ? HEALTH_TTL_UP_MS : HEALTH_TTL_DOWN_MS)) return cached.ok;
  let ok = false;
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  healthCache.set(baseUrl, { at: now, ok });
  return ok;
}

/**
 * Is the VoiceStudio app up? Cached briefly either way, so a closed app costs
 * one short probe per ten seconds — not a timeout on every spoken line.
 */
export function voiceStudioReachable(): Promise<boolean> {
  return reachable(voiceStudioBaseUrl());
}

/** Is the local Kokoro server up? Same brief caching as Voice Studio. */
export function kokoroReachable(): Promise<boolean> {
  return reachable(kokoroBaseUrl());
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

async function synthesizeWithKokoro(text: string, voice: string): Promise<SynthesizedSpeech | null> {
  const baseUrl = kokoroBaseUrl();
  if (!baseUrl || !(await kokoroReachable())) return null;
  try {
    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kokoro", input: text, voice, response_format: "wav" }),
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return {
      audio: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("Content-Type") || "audio/wav",
      provider: "kokoro",
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
    case "kokoro":
      return synthesizeWithKokoro(text, prefs.kokoroVoice);
    case "voicestudio":
      return synthesizeWithVoiceStudio(text, prefs.voice);
    case "elevenlabs":
      return synthesizeWithElevenLabs(text);
    default:
      return (
        (await synthesizeWithKokoro(text, prefs.kokoroVoice)) ??
        (await synthesizeWithVoiceStudio(text, prefs.voice)) ??
        (await synthesizeWithElevenLabs(text))
      );
  }
}

/** Audio bytes only — kept for callers that don't care which provider answered. */
export async function synthesizeSpeech(text: string, prefs?: VoicePrefs): Promise<Buffer | null> {
  return (await synthesizeSpeechDetailed(text, prefs))?.audio ?? null;
}

/** Which voice a line would come out in right now, given the choice and what is actually up. */
export function effectiveSpeechProvider(
  choice: VoiceProvider,
  available: { kokoro: boolean; voicestudio: boolean; elevenlabs: boolean },
): SpeechProviderName | "browser" {
  if (choice === "browser") return "browser";
  if (choice !== "auto") return available[choice] ? choice : "browser";
  if (available.kokoro) return "kokoro";
  return available.voicestudio ? "voicestudio" : available.elevenlabs ? "elevenlabs" : "browser";
}
