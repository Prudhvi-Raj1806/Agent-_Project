import { NextResponse, type NextRequest } from "next/server";
import { clearVoicePasscode, setVoicePasscode } from "@/server/voice/passcode";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const passcode = typeof body?.passcode === "string" ? body.passcode.trim() : "";
  if (!passcode) {
    return NextResponse.json({ ok: false, error: "A passcode phrase is required." }, { status: 400 });
  }
  setVoicePasscode(passcode);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  clearVoicePasscode();
  return NextResponse.json({ ok: true });
}
