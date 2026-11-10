import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/server/access/guard";
import { speakOnPc } from "@/server/voice/pc-playback";

const REASON_TEXT: Record<string, { status: number; error: string }> = {
  unsupported: { status: 501, error: "Speaking on this PC needs Windows." },
  stopped: { status: 409, error: "Stopped." },
  failed: { status: 500, error: "Couldn't play that on this PC." },
};

/**
 * Speaks a line through this PC's own speakers and returns once it has
 * finished. Lets a phone reply in the room when `voice.replyDevice` is "pc".
 */
export async function POST(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";

  const result = await speakOnPc(text);
  if (!result.ok) {
    const { status, error } = REASON_TEXT[result.reason];
    return NextResponse.json({ error, reason: result.reason }, { status });
  }
  return NextResponse.json({ ok: true, provider: result.provider });
}
