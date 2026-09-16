import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/server/spotify/auth";
import { isSpotifyConfigured } from "@/server/spotify/config";

export async function GET() {
  if (!isSpotifyConfigured()) {
    return NextResponse.json(
      { error: "Spotify isn't configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local." },
      { status: 400 }
    );
  }
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
