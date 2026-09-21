import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = {
  getSystemSnapshot: vi.fn(),
  listActiveMissions: vi.fn(),
  listRecentFiles: vi.fn(),
  getNowPlaying: vi.fn(),
  listUpcomingScheduleItems: vi.fn(),
  getCurrentWeather: vi.fn(),
  getNews: vi.fn(),
  listPublicProviders: vi.fn(),
  checkHealth: vi.fn(),
  getHermesConnectionInfo: vi.fn(),
};

vi.mock("@/server/system/service", () => ({ getSystemSnapshot: mocks.getSystemSnapshot }));
vi.mock("@/server/missions/service", () => ({ listActiveMissions: mocks.listActiveMissions }));
vi.mock("@/server/files/service", () => ({ listRecentFiles: mocks.listRecentFiles }));
vi.mock("@/server/spotify/client", () => ({ getNowPlaying: mocks.getNowPlaying }));
vi.mock("@/server/schedule/service", () => ({ listUpcomingScheduleItems: mocks.listUpcomingScheduleItems }));
vi.mock("@/server/weather/service", () => ({ getCurrentWeather: mocks.getCurrentWeather }));
vi.mock("@/server/news/service", () => ({ getNews: mocks.getNews }));
vi.mock("@/server/omnirouter/service", () => ({ listPublicProviders: mocks.listPublicProviders }));
vi.mock("@/server/hermes/factory", () => ({
  getHermesAdapter: () => ({ checkHealth: mocks.checkHealth }),
  getHermesConnectionInfo: mocks.getHermesConnectionInfo,
}));

/**
 * The aggregation logic is what's under test here — not the domain services
 * themselves (each already has its own tests where they exist, e.g.
 * system/service.test.ts). These mocks stand in for all nine, so the
 * reconciliation/error-isolation/staleness behavior can be verified without
 * a real DB, filesystem, or network.
 */
describe("World State reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSystemSnapshot.mockResolvedValue({ cpuPercent: 10, gpuPercent: null, ramPercent: 40, diskPercent: 50, temperatureC: null, uptimeSeconds: 100, networkDownMbps: null, networkUpMbps: null });
    mocks.listActiveMissions.mockReturnValue([]);
    mocks.listRecentFiles.mockResolvedValue([]);
    mocks.getNowPlaying.mockResolvedValue({ isPlaying: false, track: null, device: null });
    mocks.listUpcomingScheduleItems.mockReturnValue([]);
    mocks.getCurrentWeather.mockResolvedValue(null);
    mocks.getNews.mockResolvedValue([]);
    mocks.listPublicProviders.mockReturnValue([]);
    mocks.checkHealth.mockResolvedValue({ healthy: true, version: "mock", latencyMs: 0 });
    mocks.getHermesConnectionInfo.mockReturnValue({ mode: "mock" });
  });

  it("reconciles all nine domains into one snapshot, each carrying real data and provenance", async () => {
    const { getWorldState } = await import("./service");
    const state = await getWorldState();

    expect(state.generatedAt).toBeTruthy();
    expect(state.system.data?.cpuPercent).toBe(10);
    expect(state.system.error).toBeNull();
    expect(state.system.knownCacheTtlMs).toBe(5_000);
    expect(state.hermes.data).toEqual({ mode: "mock", health: { healthy: true, version: "mock", latencyMs: 0 } });
    expect(state.missions.knownCacheTtlMs).toBe(0);
  });

  it("isolates a domain failure to that domain's entry — never fails the whole snapshot, never fabricates a fallback", async () => {
    mocks.getNowPlaying.mockRejectedValue(new Error("Spotify is not connected."));

    const { getWorldState } = await import("./service");
    const state = await getWorldState();

    expect(state.spotify.data).toBeNull();
    expect(state.spotify.error).toBe("Spotify is not connected.");
    // Every other domain is unaffected.
    expect(state.system.error).toBeNull();
    expect(state.system.data?.cpuPercent).toBe(10);
  });

  it("distinguishes a legitimate empty result from an error — no upcoming schedule items is not a failure", async () => {
    mocks.listUpcomingScheduleItems.mockReturnValue([]);

    const { getWorldState } = await import("./service");
    const state = await getWorldState();

    expect(state.schedule.data).toEqual([]);
    expect(state.schedule.error).toBeNull();
  });
});

describe("isWorldStateEntryStale", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never reports stale for an always-live domain (knownCacheTtlMs = 0), regardless of age", async () => {
    const { isWorldStateEntryStale } = await import("./service");
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(isWorldStateEntryStale({ data: null, fetchedAt: old, knownCacheTtlMs: 0, error: null })).toBe(false);
  });

  it("reports stale once now exceeds fetchedAt + knownCacheTtlMs", async () => {
    const { isWorldStateEntryStale } = await import("./service");
    const fetchedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const entry = { data: null, fetchedAt, knownCacheTtlMs: 5_000, error: null };

    expect(isWorldStateEntryStale(entry, new Date("2026-01-01T00:00:04.000Z").getTime())).toBe(false);
    expect(isWorldStateEntryStale(entry, new Date("2026-01-01T00:00:06.000Z").getTime())).toBe(true);
  });
});
