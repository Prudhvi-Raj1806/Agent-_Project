import { NextResponse } from "next/server";
import { isSpotifyConnected } from "@/server/spotify/auth";
import { getNowPlaying, SpotifyNotConnectedError } from "@/server/spotify/client";

export async function GET() {
  if (!isSpotifyConnected()) {
    return NextResponse.json({ connected: false });
  }
  try {
    const nowPlaying = await getNowPlaying();
    return NextResponse.json({ connected: true, ...nowPlaying });
  } catch (err) {
    if (err instanceof SpotifyNotConnectedError) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({ connected: true, error: String(err) }, { status: 502 });
  }
}
