import { NextResponse } from "next/server";
import { isSpotifyConnected } from "@/server/spotify/auth";
import { isSpotifyConfigured } from "@/server/spotify/config";

export async function GET() {
  return NextResponse.json({ configured: isSpotifyConfigured(), connected: isSpotifyConnected() });
}
