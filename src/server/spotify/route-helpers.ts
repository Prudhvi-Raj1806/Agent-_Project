import { NextResponse } from "next/server";
import {
  SpotifyNoActiveDeviceError,
  SpotifyNotConnectedError,
  SpotifyPremiumRequiredError,
} from "./client";

/** Shared error-to-HTTP-status mapping for the playback-control routes. */
export async function runPlaybackAction(action: () => Promise<void>): Promise<NextResponse> {
  try {
    await action();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SpotifyNotConnectedError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    }
    if (err instanceof SpotifyPremiumRequiredError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    if (err instanceof SpotifyNoActiveDeviceError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "Spotify request failed." }, { status: 502 });
  }
}
