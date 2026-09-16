import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/server/spotify/auth";

/**
 * The Web Playback SDK runs in the browser and must authenticate directly
 * with Spotify's streaming servers, so — unlike every other Spotify route
 * here — this one deliberately hands the browser a real access token (never
 * the refresh token, and only to this same local user's own client-side JS,
 * not to any third party). This is how Spotify's own SDK is designed to be
 * used; there's no way to run it without the browser holding a token.
 */
export async function GET() {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Spotify is not connected." }, { status: 401 });
  }
  return NextResponse.json({ accessToken: token });
}
