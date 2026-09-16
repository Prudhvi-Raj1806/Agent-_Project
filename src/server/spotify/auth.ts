import { logger } from "@/server/logging/logger";
import { getSpotifyConfig, SPOTIFY_SCOPES } from "./config";
import { clearTokens, getTokens, saveTokens } from "./repository";
import type { SpotifyTokenSet } from "./types";

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getSpotifyConfig();
  const params = new URLSearchParams({
    client_id: clientId ?? "",
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = getSpotifyConfig();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokenSet> {
  const { redirectUri } = getSpotifyConfig();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as SpotifyTokenResponse;
  if (!data.refresh_token) throw new Error("Spotify didn't return a refresh token.");

  const tokens: SpotifyTokenSet = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope ?? SPOTIFY_SCOPES,
  };
  saveTokens(tokens);
  return tokens;
}

async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenSet> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const detail = await res.text();
    logger.warn("spotify.refresh.failed", { status: res.status, detail });
    if (res.status === 400) clearTokens(); // refresh token was revoked/invalid — force reconnect
    throw new Error(`Spotify token refresh failed: ${res.status}`);
  }
  const data = (await res.json()) as SpotifyTokenResponse;
  const tokens: SpotifyTokenSet = {
    accessToken: data.access_token,
    // Spotify only rotates the refresh token sometimes — keep the old one otherwise.
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope ?? SPOTIFY_SCOPES,
  };
  saveTokens(tokens);
  return tokens;
}

const EXPIRY_BUFFER_MS = 60_000;

/** Returns a currently-valid access token, refreshing first if needed. Null if never connected. */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens) return null;
  const expiresAt = new Date(tokens.expiresAt).getTime();
  if (Date.now() < expiresAt - EXPIRY_BUFFER_MS) return tokens.accessToken;
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  return refreshed.accessToken;
}

export function isSpotifyConnected(): boolean {
  return getTokens() !== null;
}

export function disconnectSpotify(): void {
  clearTokens();
}
