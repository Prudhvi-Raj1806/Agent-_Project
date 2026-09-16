"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface SpotifyPlayerContextValue {
  /** The browser's own Spotify Connect device id, once the Web Playback SDK is ready. Null until then. */
  deviceId: string | null;
}

const SpotifyPlayerContext = createContext<SpotifyPlayerContextValue>({ deviceId: null });

export function useSpotifyDevice(): SpotifyPlayerContextValue {
  return useContext(SpotifyPlayerContext);
}

// Minimal ambient shape for the Spotify Web Playback SDK — there's no official @types package.
interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (payload: never) => void) => void;
}
interface SpotifyPlayerConstructorOptions {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: SpotifyPlayerConstructorOptions) => SpotifyPlayerInstance;
    };
  }
}

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

/**
 * Mounted once at the app root. Registers the browser itself as a playable
 * Spotify Connect device named "JARVIS" — so play/pause/etc. work even with
 * no phone or desktop app already open. Only loads Spotify's SDK when
 * actually connected, so it costs nothing for anyone who hasn't set it up.
 */
export function SpotifyPlayerProvider({ children }: { children: React.ReactNode }) {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let player: SpotifyPlayerInstance | null = null;

    async function init() {
      let status: { connected?: boolean };
      try {
        status = await (await fetch("/api/spotify/status")).json();
      } catch {
        return;
      }
      if (cancelled || !status.connected) return;

      if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
        const script = document.createElement("script");
        script.src = SDK_SRC;
        script.async = true;
        document.body.appendChild(script);
      }

      window.onSpotifyWebPlaybackSDKReady = () => {
        if (cancelled || !window.Spotify) return;
        player = new window.Spotify.Player({
          name: "JARVIS",
          getOAuthToken: (callback) => {
            fetch("/api/spotify/player-token")
              .then((res) => res.json())
              .then((data) => callback(data.accessToken))
              .catch(() => {});
          },
          volume: 0.5,
        });

        player.addListener("ready", (payload) => {
          const { device_id } = payload as { device_id: string };
          setDeviceId(device_id);
        });
        player.addListener("not_ready", () => setDeviceId(null));

        player.connect();
      };
    }

    const timer = setTimeout(init, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      player?.disconnect();
    };
  }, []);

  return <SpotifyPlayerContext.Provider value={{ deviceId }}>{children}</SpotifyPlayerContext.Provider>;
}
