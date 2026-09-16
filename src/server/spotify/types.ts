export interface SpotifyTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
  scope: string;
}

export interface SpotifyTrackInfo {
  id: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationMs: number;
  progressMs: number;
}

export interface SpotifyDeviceInfo {
  name: string;
  volumePercent: number | null;
}

export interface SpotifyNowPlaying {
  isPlaying: boolean;
  track: SpotifyTrackInfo | null;
  device: SpotifyDeviceInfo | null;
}
