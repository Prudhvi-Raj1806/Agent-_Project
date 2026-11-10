import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/server/access/guard";
import { kokoroBaseUrl, voiceStudioBaseUrl } from "@/server/voice/tts";

export const dynamic = "force-dynamic";

const MAX_VOICES = 100;
const LIST_TIMEOUT_MS = 1_500;

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function voiceStudioVoices(): Promise<{ available: boolean; voices: { id: string; name: string }[] }> {
  const base = voiceStudioBaseUrl();
  const rows = base ? await getJson(`${base}/profiles`) : null;
  if (!Array.isArray(rows)) return { available: false, voices: [] };
  const voices = rows
    .flatMap((row) => {
      const record = row as { id?: unknown; name?: unknown };
      return typeof record.id === "string" && typeof record.name === "string"
        ? [{ id: record.id, name: record.name }]
        : [];
    })
    .slice(0, MAX_VOICES);
  return { available: true, voices };
}

async function kokoroVoices(): Promise<{ available: boolean; voices: string[] }> {
  const base = kokoroBaseUrl();
  const body = base ? ((await getJson(`${base}/v1/voices`)) as { voices?: unknown } | null) : null;
  if (!body || !Array.isArray(body.voices)) return { available: false, voices: [] };
  return { available: true, voices: body.voices.filter((v): v is string => typeof v === "string").slice(0, MAX_VOICES) };
}

/**
 * The voices each local engine offers, for the Settings pickers. An engine
 * that isn't running reports `available: false` with an empty list.
 */
export async function GET(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  const [voiceStudio, kokoro] = await Promise.all([voiceStudioVoices(), kokoroVoices()]);
  return NextResponse.json({ ...voiceStudio, kokoro });
}
