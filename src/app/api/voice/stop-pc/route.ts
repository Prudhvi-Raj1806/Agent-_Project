import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/server/access/guard";
import { stopPcSpeech } from "@/server/voice/pc-playback";

/** Cuts off whatever the PC is saying right now. */
export async function POST(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;
  return NextResponse.json({ stopped: stopPcSpeech() });
}
