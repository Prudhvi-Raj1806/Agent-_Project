import { NextResponse } from "next/server";
import { disconnectSpotify } from "@/server/spotify/auth";

export async function POST() {
  disconnectSpotify();
  return NextResponse.json({ ok: true });
}
