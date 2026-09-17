import { getValidAccessToken } from "./auth";
import type { SpotifyNowPlaying } from "./types";

export class SpotifyNotConnectedError extends Error {
  constructor() {
    super("Spotify is not connected.");
    this.name = "SpotifyNotConnectedError";
  }
}

export class SpotifyPremiumRequiredError extends Error {
  constructor() {
    super("This action requires Spotify Premium.");
    this.name = "SpotifyPremiumRequiredError";
  }
}

export class SpotifyNoActiveDeviceError extends Error {
  constructor() {
    super("No active Spotify device — open Spotify on a device first.");
    this.name = "SpotifyNoActiveDeviceError";
  }
}

async function spotifyFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) throw new SpotifyNotConnectedError();
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

/** Playback-control endpoints return 204 on success, or an error code this maps to a typed error. */
function assertPlaybackOk(res: Response): void {
  if (res.ok || res.status === 204) return;
  if (res.status === 403) throw new SpotifyPremiumRequiredError();
  if (res.status === 404) throw new SpotifyNoActiveDeviceError();
  throw new Error(`Spotify playback request failed: ${res.status}`);
}

interface SpotifyApiArtist {
  name: string;
}
interface SpotifyApiTrack {
  id: string;
  name: string;
  artists: SpotifyApiArtist[];
  duration_ms: number;
  album?: { images?: { url: string }[] };
}
interface SpotifyApiCurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number | null;
  item: SpotifyApiTrack | null;
  device?: { name: string; volume_percent: number | null };
}

export async function getNowPlaying(): Promise<SpotifyNowPlaying> {
  const res = await spotifyFetch("/me/player/currently-playing?additional_types=track");
  if (res.status === 204) return { isPlaying: false, track: null, device: null };
  if (!res.ok) throw new Error(`Spotify now-playing request failed: ${res.status}`);

  const text = await res.text();
  if (!text) return { isPlaying: false, track: null, device: null };
  const data = JSON.parse(text) as SpotifyApiCurrentlyPlaying;
  if (!data.item) return { isPlaying: false, track: null, device: null };

  return {
    isPlaying: Boolean(data.is_playing),
    track: {
      id: data.item.id,
      title: data.item.name,
      artist: data.item.artists.map((a) => a.name).join(", "),
      albumArtUrl: data.item.album?.images?.[0]?.url ?? null,
      durationMs: data.item.duration_ms,
      progressMs: data.progress_ms ?? 0,
    },
    device: data.device ? { name: data.device.name, volumePercent: data.device.volume_percent } : null,
  };
}

export async function play(): Promise<void> {
  assertPlaybackOk(await spotifyFetch("/me/player/play", { method: "PUT" }));
}
/** Moves playback onto the given device (e.g. the browser's own "JARVIS" Web Playback SDK device) — used to recover from "no active device" instead of just failing. */
export async function transferPlayback(deviceId: string, play: boolean): Promise<void> {
  assertPlaybackOk(
    await spotifyFetch("/me/player", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play }),
    })
  );
}
export async function pause(): Promise<void> {
  assertPlaybackOk(await spotifyFetch("/me/player/pause", { method: "PUT" }));
}
export async function skipNext(): Promise<void> {
  assertPlaybackOk(await spotifyFetch("/me/player/next", { method: "POST" }));
}
export async function skipPrevious(): Promise<void> {
  assertPlaybackOk(await spotifyFetch("/me/player/previous", { method: "POST" }));
}
export async function setVolume(percent: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  assertPlaybackOk(await spotifyFetch(`/me/player/volume?volume_percent=${clamped}`, { method: "PUT" }));
}
export async function seek(positionMs: number): Promise<void> {
  const clamped = Math.max(0, Math.round(positionMs));
  assertPlaybackOk(await spotifyFetch(`/me/player/seek?position_ms=${clamped}`, { method: "PUT" }));
}
