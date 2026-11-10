"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { SpotifyNowPlaying } from "@/server/spotify/types";
import { BRAND } from "@/lib/brand";

export type SpotifyStatus = "loading" | "not-configured" | "not-connected" | "connected";

const POLL_MS = 5_000;
/** Poll pace while Spotify isn't connected — nothing is playing, so there's nothing to keep fresh. */
const IDLE_POLL_MS = 60_000;

interface SpotifyPlayerContextValue {
  /** The browser's own Spotify Connect device id, once the Web Playback SDK is ready. Null until then. */
  deviceId: string | null;
  status: SpotifyStatus;
  nowPlaying: SpotifyNowPlaying | null;
  /** Re-fetches status + now-playing immediately (e.g. right after an action, so the UI doesn't wait for the next tick). */
  refresh: () => Promise<void>;
}

const SpotifyPlayerContext = createContext<SpotifyPlayerContextValue>({
  deviceId: null,
  status: "loading",
  nowPlaying: null,
  refresh: async () => {},
});

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
 *
 * Also owns the ONE now-playing poll for the whole app. Every consumer used
 * to call useSpotifyPlayer() independently, and each call started its own
 * 5s interval hitting /api/spotify/status + /api/spotify/now-playing — since
 * this provider (and the clap-wake listener nested inside it) is mounted at
 * the app root, that meant 2 duplicate requests every 5s on every route
 * forever, tripling to 3x whenever a page also rendered a now-playing panel.
 * Centralizing the poll here means exactly one set of requests, shared via
 * context, on every route. It's also visibility-aware: paused while the tab
 * is hidden, with an immediate catch-up refresh when it becomes visible again.
 */
export function SpotifyPlayerProvider({ children }: { children: React.ReactNode }) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [status, setStatus] = useState<SpotifyStatus>("loading");
  const [nowPlaying, setNowPlaying] = useState<SpotifyNowPlaying | null>(null);
  const statusRef = useRef<SpotifyStatus>("loading");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const refresh = useCallback(async () => {
    try {
      const statusRes = await fetch("/api/spotify/status");
      const statusData = await statusRes.json();
      if (!statusData.configured) {
        setStatus("not-configured");
        return;
      }
      if (!statusData.connected) {
        setStatus("not-connected");
        return;
      }
      const npRes = await fetch("/api/spotify/now-playing");
      const npData = await npRes.json();
      if (!npData.connected) {
        setStatus("not-connected");
        return;
      }
      setStatus("connected");
      setNowPlaying({ isPlaying: Boolean(npData.isPlaying), track: npData.track ?? null, device: npData.device ?? null });
    } catch {
      setStatus((prev) => (prev === "connected" ? prev : "not-connected"));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polling = false;

    // Self-scheduling so the pace can change: a connected player is polled
    // every 5s, but an unset-up or disconnected one only needs a slow check.
    async function pollOnce() {
      timer = null;
      await refresh();
      if (cancelled || !polling) return;
      timer = setTimeout(pollOnce, statusRef.current === "connected" ? POLL_MS : IDLE_POLL_MS);
    }
    function startPolling() {
      if (polling) return;
      polling = true;
      timer = setTimeout(pollOnce, POLL_MS);
    }
    function stopPolling() {
      polling = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }
    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        refresh();
        startPolling();
      }
    }

    const initial = setTimeout(() => {
      if (cancelled) return;
      refresh();
      if (!document.hidden) startPolling();
    }, 0);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    let player: SpotifyPlayerInstance | null = null;

    async function init() {
      let sdkStatus: { connected?: boolean };
      try {
        sdkStatus = await (await fetch("/api/spotify/status")).json();
      } catch {
        return;
      }
      if (cancelled || !sdkStatus.connected) return;

      if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
        const script = document.createElement("script");
        script.src = SDK_SRC;
        script.async = true;
        document.body.appendChild(script);
      }

      window.onSpotifyWebPlaybackSDKReady = () => {
        if (cancelled || !window.Spotify) return;
        player = new window.Spotify.Player({
          name: BRAND,
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

  return (
    <SpotifyPlayerContext.Provider value={{ deviceId, status, nowPlaying, refresh }}>
      {children}
    </SpotifyPlayerContext.Provider>
  );
}
