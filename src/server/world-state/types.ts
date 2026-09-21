import type { RecentFileEntry } from "@/server/files/service";
import type { HermesHealth } from "@/server/hermes/types";
import type { Mission } from "@/server/missions/types";
import type { PublicProvider } from "@/server/omnirouter/service";
import type { ScheduleItem } from "@/server/schedule/types";
import type { SpotifyNowPlaying } from "@/server/spotify/types";
import type { SystemSnapshot } from "@/server/system/service";
import type { NewsItem, WeatherStatus } from "@/lib/data/types";

/**
 * One domain's reconciled entry. `fetchedAt` is when THIS aggregation read
 * the value — not necessarily when the underlying data was captured, since
 * several domains cache internally and don't expose their own cache
 * timestamp (see `knownCacheTtlMs`). `error` is populated (never a
 * fabricated fallback) when the domain's own query threw; `data` is then
 * `null`, distinct from a domain legitimately reporting "nothing right now"
 * (e.g. no upcoming schedule items).
 */
export interface WorldStateEntry<T> {
  data: T | null;
  fetchedAt: string;
  /**
   * This domain's own documented internal cache TTL in ms, 0 if it always
   * queries live. Not a guarantee about this specific call — it's the
   * contract a caller holding onto this entry can treat it under: safe to
   * treat as fresh for up to this long after `fetchedAt`.
   */
  knownCacheTtlMs: number;
  error: string | null;
}

export interface HermesWorldState {
  mode: "agent" | "http" | "mock";
  health: HermesHealth;
}

export interface WorldState {
  generatedAt: string;
  system: WorldStateEntry<SystemSnapshot>;
  missions: WorldStateEntry<Mission[]>;
  files: WorldStateEntry<RecentFileEntry[]>;
  spotify: WorldStateEntry<SpotifyNowPlaying>;
  schedule: WorldStateEntry<ScheduleItem[]>;
  weather: WorldStateEntry<WeatherStatus | null>;
  news: WorldStateEntry<NewsItem[]>;
  omnirouter: WorldStateEntry<PublicProvider[]>;
  hermes: WorldStateEntry<HermesWorldState>;
}

export type WorldStateDomain = keyof Omit<WorldState, "generatedAt">;
