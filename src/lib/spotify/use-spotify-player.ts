"use client";

import { useCallback, useState } from "react";
import { useSpotifyDevice } from "./player-context";

export type { SpotifyStatus } from "./player-context";

/**
 * Thin per-consumer wrapper around the single shared poll owned by
 * SpotifyPlayerProvider (see player-context.tsx) — status/nowPlaying/deviceId
 * all come from context, so mounting this hook in multiple components (Music
 * page, home Now Playing panel, focus panel, the clap-wake listener) no
 * longer starts a duplicate 5s polling loop per mount.
 */
export function useSpotifyPlayer() {
  const { deviceId, status, nowPlaying, refresh } = useSpotifyDevice();
  const [actionError, setActionError] = useState<string | null>(null);

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
    seek: (positionMs: number) => runAction("seek", { positionMs }),
  };
}
