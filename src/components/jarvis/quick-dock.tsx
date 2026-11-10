"use client";

import Link from "next/link";
import { CalendarDays, ListChecks, Music2, Newspaper, Pause, Play, Timer } from "lucide-react";
import { useSpotifyPlayer } from "@/lib/spotify/use-spotify-player";
import { cn } from "@/lib/utils";

const item =
  "flex flex-col items-center gap-1 border border-transparent px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent-cyan/30 hover:bg-accent-cyan/5 hover:text-accent-cyan disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

const links = [
  { href: "/work", label: "Work", Icon: ListChecks },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/focus", label: "Focus", Icon: Timer },
  { href: "/music", label: "Music", Icon: Music2 },
] as const;

/**
 * One-tap shortcuts under the prompt box. Every entry does something real:
 * "Brief" speaks the live briefing, the music toggle drives Spotify, and the
 * rest are plain navigation — nothing here starts a mission behind the owner's back.
 */
export function QuickDock({ onBrief, briefDisabled }: { onBrief: () => void; briefDisabled: boolean }) {
  const { status, nowPlaying, play, pause } = useSpotifyPlayer();
  const musicReady = status === "connected";
  const isPlaying = nowPlaying?.isPlaying ?? false;

  return (
    <nav aria-label="Quick actions" className="flex flex-wrap items-center justify-center gap-1">
      <button type="button" onClick={onBrief} disabled={briefDisabled} className={item}>
        <Newspaper className="size-4" />
        Brief
      </button>
      <button
        type="button"
        onClick={isPlaying ? pause : play}
        disabled={!musicReady}
        aria-label={isPlaying ? "Pause music" : "Play music"}
        title={musicReady ? undefined : "Connect Spotify to use this"}
        className={cn(item, isPlaying && "text-accent-cyan")}
      >
        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        {isPlaying ? "Pause" : "Play"}
      </button>
      {links.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className={item}>
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
