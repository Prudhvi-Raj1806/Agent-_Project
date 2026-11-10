import { NextResponse } from "next/server";
import { handyStatus } from "@/server/voice/handy";
import { currentVoicePrefs } from "@/server/voice/prefs";
import { pcPlaybackSupported } from "@/server/voice/pc-playback";
import {
  effectiveSpeechProvider,
  isElevenLabsConfigured,
  kokoroReachable,
  voiceStudioReachable,
} from "@/server/voice/tts";

export const dynamic = "force-dynamic";

/**
 * Which voice pieces are actually available right now, and which one a line
 * would use given the owner's choice. Drives the status chips on /jarvis.
 */
export async function GET() {
  const [kokoro, voiceStudio, handy] = await Promise.all([kokoroReachable(), voiceStudioReachable(), handyStatus()]);
  const { provider } = currentVoicePrefs();
  const speech = effectiveSpeechProvider(provider, {
    kokoro,
    voicestudio: voiceStudio,
    elevenlabs: isElevenLabsConfigured(),
  });
  return NextResponse.json({
    speech,
    choice: provider,
    handy,
    pcPlayback: pcPlaybackSupported(),
  });
}
