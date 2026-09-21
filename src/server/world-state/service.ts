import { nowIso } from "@/server/db/util";
import { listRecentFiles } from "@/server/files/service";
import { getHermesAdapter, getHermesConnectionInfo } from "@/server/hermes/factory";
import { listActiveMissions } from "@/server/missions/service";
import { getNews } from "@/server/news/service";
import { listPublicProviders } from "@/server/omnirouter/service";
import { listUpcomingScheduleItems } from "@/server/schedule/service";
import { getNowPlaying } from "@/server/spotify/client";
import { getSystemSnapshot } from "@/server/system/service";
import { getCurrentWeather } from "@/server/weather/service";
import type { HermesWorldState, WorldState, WorldStateEntry } from "./types";

/**
 * JARVIS's World State reconciliation layer (Phase 03). Each domain already
 * has its own real service — this does not replace or re-cache any of them,
 * it just queries all of them together and wraps each result in the same
 * provenance shape, so a caller gets one authoritative, honestly-labeled
 * snapshot of "what's happening right now" instead of hand-rolling its own
 * parallel fetches per screen. A domain that fails (e.g. Spotify not
 * connected) reports `error`, not a fabricated empty-but-successful value,
 * and never fails the rest of the snapshot.
 *
 * Deliberately NOT a background poller or an always-on cache: every call
 * queries live, delegating to each domain's own existing caching (system:
 * 5s, weather: 15min, news: 20min, everything else: always live). Per the
 * project's performance principles, an additional world-state-level cache
 * or timer on top of that would just be a second resource-consumption
 * pattern layered on the first, for no real benefit — callers that want a
 * cheaper poll interval should throttle their own calls into this module.
 */

async function settle<T>(fn: () => Promise<T> | T, knownCacheTtlMs: number): Promise<WorldStateEntry<T>> {
  const fetchedAt = nowIso();
  try {
    const data = await fn();
    return { data, fetchedAt, knownCacheTtlMs, error: null };
  } catch (err) {
    return { data: null, fetchedAt, knownCacheTtlMs, error: err instanceof Error ? err.message : String(err) };
  }
}

async function getHermesWorldState(): Promise<HermesWorldState> {
  const adapter = getHermesAdapter();
  const health = await adapter.checkHealth();
  return { mode: getHermesConnectionInfo().mode, health };
}

export async function getWorldState(): Promise<WorldState> {
  const [system, missions, files, spotify, schedule, weather, news, omnirouter, hermes] = await Promise.all([
    settle(() => getSystemSnapshot(), 5_000),
    settle(() => listActiveMissions(), 0),
    settle(() => listRecentFiles(), 0),
    settle(() => getNowPlaying(), 0),
    settle(() => listUpcomingScheduleItems(), 0),
    settle(() => getCurrentWeather(), 15 * 60_000),
    settle(() => getNews(), 20 * 60_000),
    settle(() => listPublicProviders(), 0),
    settle(() => getHermesWorldState(), 0),
  ]);

  return { generatedAt: nowIso(), system, missions, files, spotify, schedule, weather, news, omnirouter, hermes };
}

/**
 * Whether a previously-obtained entry should still be trusted without
 * re-querying. `knownCacheTtlMs === 0` (an always-live domain) is never
 * stale by this definition — it was accurate at `fetchedAt` and there is no
 * known cache window to reason about, so the caller re-queries whenever it
 * wants a newer value rather than being told a specific expiry.
 */
export function isWorldStateEntryStale(entry: WorldStateEntry<unknown>, now: number = Date.now()): boolean {
  if (entry.knownCacheTtlMs <= 0) return false;
  return now - new Date(entry.fetchedAt).getTime() > entry.knownCacheTtlMs;
}

export type { WorldState, WorldStateEntry, WorldStateDomain, HermesWorldState } from "./types";
