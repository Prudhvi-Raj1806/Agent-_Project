"use client";

import { useCallback, useEffect, useState } from "react";
import type { SpotifyNowPlaying } from "@/server/spotify/types";
import { useSpotifyDevice } from "./player-context";

export type SpotifyStatus = "loading" | "not-configured" | "not-connected" | "connected";

const POLL_MS = 5_000;

export function useSpotifyPlayer() {
  const { deviceId } = useSpotifyDevice();
  const [status, setStatus] = useState<SpotifyStatus>("loading");
  const [nowPlaying, setNowPlaying] = useState<SpotifyNowPlaying | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    // Deferred via setTimeout(0) rather than called directly, so the effect
    // body itself never invokes a state-setting function synchronously —
    // only ever from a timer callback (same shape as the SSE hooks).
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [refresh]);

  const runAction = useCallback(
    async (path: string, body?: unknown): Promise<{ ok: boolean; status: number; error?: string }> => {
      setActionError(null);
      try {
        const res = await fetch(`/api/spotify/${path}`, {
          method: "POST",
          headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        if (!res.ok) {
          setActionError(data.error ?? "Action failed.");
          return { ok: false, status: res.status, error: data.error };
        }
        setTimeout(refresh, 400);
        return { ok: true, status: res.status };
      } catch {
        setActionError("Couldn't reach JARVIS.");
        return { ok: false, status: 0 };
      }
    },
    [refresh]
  );

  const play = useCallback(async () => {
    const result = await runAction("play");
    // No device was active — if the browser's own "JARVIS" device is ready
    // (the Web Playback SDK), move playback onto it and retry once, so
    // playback works with nothing else open rather than just failing.
    if (!result.ok && result.status === 404 && deviceId) {
      const transferred = await runAction("transfer", { deviceId, play: true });
      if (!transferred.ok) return;
      await runAction("play");
    }
  }, [runAction, deviceId]);

  return {
    status,
    nowPlaying,
    actionError,
    play,
    pause: () => runAction("pause"),
    next: () => runAction("next"),
    previous: () => runAction("previous"),
    setVolume: (percent: number) => runAction("volume", { percent }),
  };
}
