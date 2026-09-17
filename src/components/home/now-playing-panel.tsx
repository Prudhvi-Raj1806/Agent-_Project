"use client";

import Image from "next/image";
import { Headphones, Music2, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import { Skeleton } from "@/components/primitives/skeleton";
import { useSpotifyPlayer } from "@/lib/spotify/use-spotify-player";
import { formatDuration } from "@/lib/format";
import { sliderTrackClasses as sliderClasses, sliderFillStyle } from "@/lib/slider-styles";
import { cn } from "@/lib/utils";

function HeaderIcon() {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-status-success text-background">
      <Music2 className="size-2.5" strokeWidth={2.5} />
    </span>
  );
}

export function NowPlayingPanel({ className }: { className?: string }) {
  const { status, nowPlaying, actionError, play, pause, next, previous, setVolume } = useSpotifyPlayer();

  if (status === "loading") {
    return (
      <Panel className={className}>
        <PanelHeader icon={<HeaderIcon />} title="Now Playing" />
        <PanelBody className="flex flex-col pt-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-3 h-1 w-full rounded-full" />
        </PanelBody>
      </Panel>
    );
  }

  if (status !== "connected") {
    return (
      <Panel className={className}>
        <PanelHeader icon={<HeaderIcon />} title="Now Playing" />
        <PanelBody className="flex flex-col items-center justify-center gap-2.5 text-center">
          <Music2 className="size-6 text-text-dim" strokeWidth={1.5} />
          <p className="text-xs text-muted-foreground">
            {status === "not-configured" ? "Spotify isn't set up yet." : "Spotify isn't connected."}
          </p>
          {status === "not-connected" && (
            <a
              href="/api/spotify/login"
              className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              Connect Spotify
            </a>
          )}
        </PanelBody>
      </Panel>
    );
  }

  const track = nowPlaying?.track ?? null;
  if (!track) {
    return (
      <Panel className={className}>
        <PanelHeader icon={<HeaderIcon />} title="Now Playing" />
        <PanelBody className="flex flex-col items-center justify-center gap-2 text-center">
          <Music2 className="size-6 text-text-dim" strokeWidth={1.5} />
          <p className="text-xs text-muted-foreground">Nothing playing right now.</p>
        </PanelBody>
      </Panel>
    );
  }

  const isPlaying = nowPlaying?.isPlaying ?? false;
  const progressSec = Math.floor(track.progressMs / 1000);
  const durationSec = Math.floor(track.durationMs / 1000);
  const progress = durationSec > 0 ? (progressSec / durationSec) * 100 : 0;
  const volume = nowPlaying?.device?.volumePercent ?? 0;

  return (
    <Panel className={className}>
      <PanelHeader icon={<HeaderIcon />} title="Now Playing" />
      <PanelBody className="flex flex-col pt-3">
        <div className="flex items-center gap-3">
          <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 text-muted-foreground">
            {track.albumArtUrl ? (
              <Image src={track.albumArtUrl} alt="" fill sizes="48px" className="object-cover" unoptimized />
            ) : (
              <Music2 className="size-5" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{track.title}</p>
            <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
          </div>
        </div>

        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent-cyan" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
            <span>{formatDuration(progressSec)}</span>
            <span>{formatDuration(durationSec)}</span>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-6">
          <button
            type="button"
            aria-label="Previous track"
            onClick={previous}
            className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <SkipBack className="size-4" />
          </button>
          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={isPlaying ? pause : play}
            className="flex size-10 items-center justify-center rounded-full border border-accent-cyan text-foreground transition-transform active:scale-95"
          >
            {isPlaying ? (
              <Pause className="size-4" fill="currentColor" />
            ) : (
              <Play className="ml-0.5 size-4" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            aria-label="Next track"
            onClick={next}
            className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <SkipForward className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 border-t border-border pt-2.5 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-status-success">
            <Headphones className="size-3.5 shrink-0" />
            <span className="truncate">{nowPlaying?.device?.name ?? "Spotify"}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Volume2 className="size-3.5 text-muted-foreground" />
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={volume}
              onMouseUp={(e) => setVolume(Number(e.currentTarget.value))}
              onTouchEnd={(e) => setVolume(Number(e.currentTarget.value))}
              aria-label="Volume"
              className={cn(sliderClasses, "w-16")}
              style={sliderFillStyle(volume)}
            />
          </span>
        </div>
        {actionError && <p className="mt-1.5 text-[11px] text-status-error">{actionError}</p>}
      </PanelBody>
    </Panel>
  );
}
