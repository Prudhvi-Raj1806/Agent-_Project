import { NextResponse, type NextRequest } from "next/server";
import { seek } from "@/server/spotify/client";
import { runPlaybackAction } from "@/server/spotify/route-helpers";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const positionMs = typeof body?.positionMs === "number" ? body.positionMs : null;
  if (positionMs === null) {
    return NextResponse.json({ ok: false, error: "`positionMs` must be a number." }, { status: 400 });
  }
  return runPlaybackAction(() => seek(positionMs));
}
