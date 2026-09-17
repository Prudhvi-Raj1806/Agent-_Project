"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import { Skeleton } from "@/components/primitives/skeleton";
import { useSpotifyPlayer } from "@/lib/spotify/use-spotify-player";
import { formatDuration } from "@/lib/format";

function Header() {
  return (
    <PanelHeader
      icon={
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-status-success text-background">
          <Music2 className="size-2.5" strokeWidth={2.5} />
        </span>
      }
      title="Focus Music"
      action={
        <Link
          href="/music"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          See all
          <ArrowRight className="size-3" />
        </Link>
      }
    />
  );
}

export function FocusMusicPanel({ className }: { className?: string }) {
  const { status, nowPlaying, play, pause, next, previous } = useSpotifyPlayer();

  if (status === "loading") {
    return (
      <Panel className={className}>
        <Header />
        <PanelBody className="flex flex-col justify-center py-2">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-2 h-1 w-full rounded-full" />
        </PanelBody>
      </Panel>
    );
  }

  if (status !== "connected" || !nowPlaying?.track) {
    return (
      <Panel className={className}>
        <Header />
        <PanelBody className="flex flex-col items-center justify-center gap-2 text-center">
          <Music2 className="size-5 text-text-dim" strokeWidth={1.5} />
          <p className="text-xs text-muted-foreground">
            {status === "not-connected" ? (
              <a href="/api/spotify/login" className="text-accent-cyan hover:underline">
                Connect Spotify
              </a>
            ) : status === "not-configured" ? (
              "Spotify isn't set up yet."
            ) : (
              "Nothing playing right now."
            )}
          </p>
        </PanelBody>
      </Panel>
    );
  }

  const { track } = nowPlaying;
  const isPlaying = nowPlaying.isPlaying;
  const progressSec = Math.floor(track.progressMs / 1000);
  const durationSec = Math.floor(track.durationMs / 1000);
  const progress = durationSec > 0 ? (progressSec / durationSec) * 100 : 0;

  return (
    <Panel className={className}>
      <Header />
      <PanelBody className="flex flex-col justify-center py-2">
        <div className="flex items-center gap-3">
          <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 text-muted-foreground">
            {track.albumArtUrl ? (
              <Image src={track.albumArtUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
            ) : (
              <Music2 className="size-4" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{track.title}</p>
            <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
          </div>
        </div>

        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent-cyan" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
            <span>{formatDuration(progressSec)}</span>
            <span>{formatDuration(durationSec)}</span>
          </div>
        </div>

        <div className="mt-1.5 flex shrink-0 items-center justify-center gap-6">
          <button
            type="button"
            aria-label="Previous track"
            onClick={previous}
            className="flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <SkipBack className="size-4" />
          </button>
          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={isPlaying ? pause : play}
            className="flex size-9 items-center justify-center rounded-full border border-accent-cyan text-foreground transition-transform active:scale-95"
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
            className="flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <SkipForward className="size-4" />
          </button>
        </div>
      </PanelBody>
    </Panel>
  );
}
