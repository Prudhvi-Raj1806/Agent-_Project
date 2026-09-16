import { NextResponse } from "next/server";
import { getVoiceVerifier, isVoicePasscodeConfigured } from "@/server/voice/passcode";

export async function GET() {
  return NextResponse.json({ configured: isVoicePasscodeConfigured() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const transcript = typeof body?.transcript === "string" ? body.transcript : "";
  if (!transcript.trim()) {
    return NextResponse.json({ ok: false, reason: "No speech was captured." }, { status: 400 });
  }

  const result = getVoiceVerifier().verify({ transcript });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 403 });
  }
  return NextResponse.json({ ok: true, token: result.token });
}
