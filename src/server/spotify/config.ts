/**
 * Spotify requires playback-control scopes, so read-only "currently playing"
 * isn't enough — the user must grant `user-modify-playback-state` too.
 * `streaming` (+ `user-read-email`/`user-read-private`, which the Web
 * Playback SDK's init call expects) lets the browser itself become a
 * playable Spotify Connect device — "JARVIS" — so playback works even with
 * no other device already active. All scopes are requested up front rather
 * than incrementally.
 */
export const SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "streaming",
  "user-read-email",
  "user-read-private",
].join(" ");

export interface SpotifyConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string;
}

export function getSpotifyConfig(): SpotifyConfig {
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    // Spotify's OAuth no longer accepts a plain "localhost" redirect over
    // HTTP — it must be the literal loopback IP 127.0.0.1 (or HTTPS).
    redirectUri: process.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:3000/api/spotify/callback",
  };
}

export function isSpotifyConfigured(): boolean {
  const { clientId, clientSecret } = getSpotifyConfig();
  return Boolean(clientId && clientSecret);
}
