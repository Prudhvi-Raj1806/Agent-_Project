"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Headphones, Music2, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useSpotifyPlayer } from "@/lib/spotify/use-spotify-player";
import { Skeleton } from "@/components/primitives/skeleton";
import { formatDuration } from "@/lib/format";
import { sliderTrackClasses, sliderFillStyle } from "@/lib/slider-styles";
import { cn } from "@/lib/utils";

function VolumeIcon({ percent }: { percent: number }) {
  if (percent === 0) return <VolumeX className="size-4 text-muted-foreground" />;
  if (percent < 50) return <Volume1 className="size-4 text-muted-foreground" />;
  return <Volume2 className="size-4 text-muted-foreground" />;
}

function CenteredMessage({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Icon className="size-8 text-text-dim" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

export function MusicView() {
  const { status, nowPlaying, actionError, play, pause, next, previous, setVolume, seek } = useSpotifyPlayer();
  const [seekPreviewSec, setSeekPreviewSec] = useState<number | null>(null);
  const [liveProgressSec, setLiveProgressSec] = useState(0);
  const [trackedProgressSignature, setTrackedProgressSignature] = useState<string | null>(null);

  const track = nowPlaying?.track ?? null;
  const isPlaying = nowPlaying?.isPlaying ?? false;
  const trackId = track?.id ?? null;
  const progressMs = track?.progressMs ?? 0;
  const durationSec = Math.floor((track?.durationMs ?? 0) / 1000);

  // Adjust local progress during render when the server reports a new
  // position (new track, or a fresh 5s poll) — React's sanctioned pattern
  // for syncing state to a changed value without an effect round-trip.
  const progressSignature = trackId ? `${trackId}:${progressMs}` : null;
  if (progressSignature !== trackedProgressSignature) {
    setTrackedProgressSignature(progressSignature);
    setLiveProgressSec(trackId ? Math.floor(progressMs / 1000) : 0);
  }

  // Tick the local progress forward every second while playing, so the bar
  // moves smoothly between polls instead of jumping only on refresh.
  useEffect(() => {
    if (!isPlaying || !trackId) return;
    const interval = setInterval(() => {
      setLiveProgressSec((prev) => Math.min(prev + 1, durationSec));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, trackId, durationSec]);

  if (status === "loading") {
    return (
      <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-8">
        <Skeleton className="size-56 shrink-0 rounded-2xl" />
        <div className="w-full space-y-2 text-center">
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="mx-auto h-4 w-32" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="flex items-center justify-center gap-8">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
    );
  }

  if (status !== "connected") {
    return (
      <CenteredMessage
        icon={Music2}
        message={status === "not-configured" ? "Spotify isn't set up yet." : "Spotify isn't connected."}
        action={
          status === "not-connected" ? (
            <a
              href="/api/spotify/login"
              className="mt-1 rounded-md border border-border bg-surface-1 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              Connect Spotify
            </a>
          ) : undefined
        }
      />
    );
  }

  if (!track) {
    return <CenteredMessage icon={Music2} message="Nothing playing right now." />;
  }

  const progressSec = seekPreviewSec ?? liveProgressSec;
  const progressPercent = durationSec > 0 ? (progressSec / durationSec) * 100 : 0;
  const volume = nowPlaying?.device?.volumePercent ?? 0;
  const onJarvisDevice = nowPlaying?.device?.name === "JARVIS";

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-8">
      <div className="relative flex size-56 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-1 text-muted-foreground shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
        {track.albumArtUrl ? (
          <Image src={track.albumArtUrl} alt="" fill sizes="224px" className="object-cover" unoptimized />
        ) : (
          <Music2 className="size-12" strokeWidth={1.25} />
        )}
      </div>

      <div className="w-full text-center">
        <p className="truncate text-2xl font-semibold text-foreground">{track.title}</p>
        <p className="mt-1 truncate text-base text-muted-foreground">{track.artist}</p>
      </div>

      <div className="w-full">
        <input
          type="range"
          min={0}
          max={durationSec || 1}
          value={progressSec}
          onChange={(e) => setSeekPreviewSec(Number(e.currentTarget.value))}
          onMouseUp={(e) => {
            seek(Number(e.currentTarget.value) * 1000);
            setSeekPreviewSec(null);
          }}
          onTouchEnd={(e) => {
            seek(Number(e.currentTarget.value) * 1000);
            setSeekPreviewSec(null);
          }}
          aria-label="Seek"
          className={cn(sliderTrackClasses, "w-full")}
          style={sliderFillStyle(progressPercent)}
        />
        <div className="mt-1.5 flex items-center justify-between font-mono text-xs text-muted-foreground tabular-nums">
          <span>{formatDuration(progressSec)}</span>
          <span>{formatDuration(durationSec)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-8">
        <button
          type="button"
          aria-label="Previous track"
          onClick={previous}
          className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <SkipBack className="size-5" />
        </button>
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={isPlaying ? pause : play}
          className="flex size-14 items-center justify-center rounded-full border border-accent-cyan text-foreground transition-transform active:scale-95"
        >
          {isPlaying ? (
            <Pause className="size-6" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 size-6" fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          aria-label="Next track"
          onClick={next}
          className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <SkipForward className="size-5" />
        </button>
      </div>

      <div className="flex w-full items-center justify-between gap-6 border-t border-border pt-4">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-status-success">
          <Headphones className="size-3.5 shrink-0" />
          <span className="truncate">
            {nowPlaying?.device?.name ?? "Spotify"}
            {onJarvisDevice && <span className="text-muted-foreground"> · this device</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <VolumeIcon percent={volume} />
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={volume}
            onMouseUp={(e) => setVolume(Number(e.currentTarget.value))}
            onTouchEnd={(e) => setVolume(Number(e.currentTarget.value))}
            aria-label="Volume"
            className={cn(sliderTrackClasses, "w-28")}
            style={sliderFillStyle(volume)}
          />
        </span>
      </div>

      {actionError && <p className="text-xs text-status-error">{actionError}</p>}
    </div>
  );
}
