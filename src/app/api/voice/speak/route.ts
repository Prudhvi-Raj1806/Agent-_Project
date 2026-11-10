import { NextResponse, type NextRequest } from "next/server";
import { synthesizeSpeechDetailed } from "@/server/voice/tts";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "`text` is required." }, { status: 400 });
  }

  const speech = await synthesizeSpeechDetailed(text);
  if (!speech) {
    // Neither VoiceStudio (app not open) nor ElevenLabs (not configured, or
    // the request failed) could speak — the client falls back to the
    // browser's built-in SpeechSynthesis instead.
    return NextResponse.json({ error: "No speech provider is available." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(speech.audio), {
    headers: { "Content-Type": speech.contentType, "X-Voice-Provider": speech.provider },
  });
}
