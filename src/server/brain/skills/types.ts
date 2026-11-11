import type { ScheduleItem, SystemStatus, WeatherStatus } from "@/lib/data/types";
import type { SpotifyNowPlaying } from "@/server/spotify/types";

/**
 * One thing the mini brain can do by itself. Skills take no arguments and
 * build their reply in code from real data, so a fact is never invented by
 * the model. A skill reports failure as `ok: false` with a sentence the
 * owner can hear; it does not throw.
 */
export interface BrainSkill {
  /** e.g. "music.pause". Shown to the router as one of the allowed choices. */
  id: string;
  /** One line, shown to the router. */
  description: string;
  /** 2 to 4 phrases, shown to the router. */
  examples: string[];
  needsInternet: boolean;
  run(): Promise<{ ok: boolean; reply: string }>;
}

/** Where skills get their data. Injected, so every skill is testable without the real services. */
export interface SkillSources {
  now(): Date;
  ownerName(): string;
  system(): Promise<SystemStatus>;
  schedule(): Promise<ScheduleItem[]>;
  weather(): Promise<WeatherStatus | null>;
  /** Runs one of the dashboard's quick actions by id, through the same governed path its button uses. */
  runAction(id: string): Promise<{ ok: boolean; message: string }>;
  music: {
    play(): Promise<void>;
    pause(): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    nowPlaying(): Promise<SpotifyNowPlaying>;
  };
}
