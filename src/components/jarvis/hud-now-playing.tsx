"use client";

import Image from "next/image";
import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { HudPanel } from "@/components/jarvis/hud-panel";
import { formatDuration } from "@/lib/format";
import { useSpotifyPlayer } from "@/lib/spotify/use-spotify-player";

/** Spotify now-playing in the HUD frame. Reads the app's single shared poll — it adds no requests of its own. */
export function HudNowPlaying() {
  const { status, nowPlaying, actionError, play, pause, next, previous } = useSpotifyPlayer();
  const track = nowPlaying?.track ?? null;

  if (status !== "connected" || !track) {
    const message =
      status === "loading"
        ? "Checking Spotify…"
        : status === "not-configured"
          ? "Spotify isn't set up yet."
          : status === "not-connected"
            ? "Spotify isn't connected."
            : "Nothing playing right now.";
    return (
      <HudPanel title="Now playing">
        <div className="flex items-center gap-3">
          <Music2 className="size-5 shrink-0 text-text-dim" strokeWidth={1.5} />
          <p className="text-xs text-text-dim">{message}</p>
          {status === "not-connected" && (
            <a
              href="/api/spotify/login"
              className="ml-auto font-mono text-[10px] uppercase tracking-wider text-accent-cyan/80 hover:text-accent-cyan"
            >
              Connect
            </a>
          )}
        </div>
      </HudPanel>
    );
  }

  const isPlaying = nowPlaying?.isPlaying ?? false;
  const progressSec = Math.floor(track.progressMs / 1000);
  const durationSec = Math.floor(track.durationMs / 1000);
  const progress = durationSec > 0 ? Math.min(100, (progressSec / durationSec) * 100) : 0;
  const control = "flex size-7 items-center justify-center text-muted-foreground transition-colors hover:text-accent-cyan";

  return (
    <HudPanel title="Now playing" meta={nowPlaying?.device?.name ?? "Spotify"}>
      <div className="flex items-center gap-3">
        <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden bg-surface-2 text-text-dim">
          {track.albumArtUrl ? (
            <Image src={track.albumArtUrl} alt="" fill sizes="44px" className="object-cover" unoptimized />
          ) : (
            <Music2 className="size-5" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">{track.title}</p>
          <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
        </div>
      </div>
      <div className="mt-2.5 h-px w-full bg-surface-3">
        <div className="h-full bg-accent-cyan" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[10px] tabular-nums text-text-dim">
        <span>{formatDuration(progressSec)}</span>
        <span>{formatDuration(durationSec)}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-4">
        <button type="button" aria-label="Previous track" onClick={previous} className={control}>
          <SkipBack className="size-4" />
        </button>
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={isPlaying ? pause : play}
          className="flex size-8 items-center justify-center border border-accent-cyan/50 text-accent-cyan transition-colors hover:bg-accent-cyan/10"
        >
          {isPlaying ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="ml-0.5 size-3.5" fill="currentColor" />}
        </button>
        <button type="button" aria-label="Next track" onClick={next} className={control}>
          <SkipForward className="size-4" />
        </button>
      </div>
      {actionError && <p className="mt-1.5 text-[11px] text-status-error">{actionError}</p>}
    </HudPanel>
  );
}
