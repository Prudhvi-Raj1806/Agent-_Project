import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/server/access/guard";
import { currentVoicePrefs } from "@/server/voice/prefs";
import { synthesizeSpeechDetailed } from "@/server/voice/tts";

/** Audio for one line, from the provider the owner chose in Settings. */
export async function POST(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "`text` is required." }, { status: 400 });
  }

  const speech = await synthesizeSpeechDetailed(text, currentVoicePrefs());
  if (!speech) {
    // No chosen provider could speak — the client falls back to the browser's
    // built-in SpeechSynthesis instead.
    return NextResponse.json({ error: "No speech provider is available." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(speech.audio), {
    headers: { "Content-Type": speech.contentType, "X-Voice-Provider": speech.provider },
  });
}
