import { NextResponse, type NextRequest } from "next/server";
import { transferPlayback } from "@/server/spotify/client";
import { runPlaybackAction } from "@/server/spotify/route-helpers";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null;
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "`deviceId` is required." }, { status: 400 });
  }
  return runPlaybackAction(() => transferPlayback(deviceId, body?.play !== false));
}
