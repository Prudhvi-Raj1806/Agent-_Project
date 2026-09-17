import { NextResponse, type NextRequest } from "next/server";
import { synthesizeSpeech } from "@/server/voice/tts";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "`text` is required." }, { status: 400 });
  }

  const audio = await synthesizeSpeech(text);
  if (!audio) {
    // No ElevenLabs configured (or the request failed) — the client falls
    // back to the browser's built-in SpeechSynthesis instead.
    return NextResponse.json({ error: "ElevenLabs isn't configured." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
}
