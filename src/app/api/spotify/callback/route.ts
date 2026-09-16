import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/server/logging/logger";
import { exchangeCodeForTokens } from "@/server/spotify/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const expectedState = request.cookies.get("spotify_oauth_state")?.value;

  const redirectTo = new URL("/", request.url);

  if (error) {
    redirectTo.searchParams.set("spotify_error", error);
    return NextResponse.redirect(redirectTo);
  }
  if (!code || !state || state !== expectedState) {
    redirectTo.searchParams.set("spotify_error", "state_mismatch");
    return NextResponse.redirect(redirectTo);
  }

  try {
    await exchangeCodeForTokens(code);
    redirectTo.searchParams.set("spotify_connected", "1");
  } catch (err) {
    logger.error("spotify.callback.exchange_failed", { error: String(err) });
    redirectTo.searchParams.set("spotify_error", "token_exchange_failed");
  }

  const response = NextResponse.redirect(redirectTo);
  response.cookies.delete("spotify_oauth_state");
  return response;
}
