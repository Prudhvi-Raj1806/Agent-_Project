import { NextResponse } from "next/server";
import { handyStatus } from "@/server/voice/handy";
import { isElevenLabsConfigured, voiceStudioReachable } from "@/server/voice/tts";

export const dynamic = "force-dynamic";

/** Which voice pieces are actually available right now — drives the status chips on /jarvis. */
export async function GET() {
  const [voiceStudio, handy] = await Promise.all([voiceStudioReachable(), handyStatus()]);
  return NextResponse.json({
    speech: voiceStudio ? "voicestudio" : isElevenLabsConfigured() ? "elevenlabs" : "browser",
    handy,
  });
}
