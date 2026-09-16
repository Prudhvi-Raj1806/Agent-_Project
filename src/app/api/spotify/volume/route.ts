import { NextResponse, type NextRequest } from "next/server";
import { setVolume } from "@/server/spotify/client";
import { runPlaybackAction } from "@/server/spotify/route-helpers";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const percent = typeof body?.percent === "number" ? body.percent : null;
  if (percent === null) {
    return NextResponse.json({ ok: false, error: "`percent` must be a number." }, { status: 400 });
  }
  return runPlaybackAction(() => setVolume(percent));
}
