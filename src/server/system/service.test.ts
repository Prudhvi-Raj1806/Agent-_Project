import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const si = {
  currentLoad: vi.fn(async () => ({ currentLoad: 12, cpus: [{ load: 10 }, { load: 14 }] })),
  mem: vi.fn(async () => ({ active: 4_000_000_000, total: 8_000_000_000, available: 4_000_000_000, swapused: 0, swaptotal: 0 })),
  fsSize: vi.fn(async () => [{ mount: "C:", size: 100, used: 50, use: 50 }]),
  graphics: vi.fn(async () => ({ controllers: [{ utilizationGpu: null, model: "Intel Iris" }] })),
  time: vi.fn(async () => ({ uptime: 1234 })),
  cpuTemperature: vi.fn(async () => ({ main: null })),
  networkStats: vi.fn(async () => [{ iface: "Ethernet", rx_sec: 1_000_000, tx_sec: 500_000 }]),
  osInfo: vi.fn(async () => ({ platform: "win32", distro: "Windows 11", arch: "x64", hostname: "test", kernel: "10.0" })),
  battery: vi.fn(async () => ({ hasBattery: false, percent: 0, isCharging: false })),
};

vi.mock("systeminformation", () => ({ default: si }));

describe("system telemetry caching", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses a cached snapshot instead of re-querying systeminformation on every call", async () => {
    const { getSystemSnapshot } = await import("./service");

    await getSystemSnapshot();
    await getSystemSnapshot();
    await getSystemSnapshot();

    expect(si.currentLoad).toHaveBeenCalledTimes(1);
    expect(si.networkStats).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight computation across concurrent callers", async () => {
    const { getSystemSnapshot } = await import("./service");

    const [a, b, c] = await Promise.all([getSystemSnapshot(), getSystemSnapshot(), getSystemSnapshot()]);

    expect(si.currentLoad).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("refreshes once the cache TTL has elapsed", async () => {
    const { getSystemSnapshot } = await import("./service");

    await getSystemSnapshot();
    expect(si.currentLoad).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6_000);

    await getSystemSnapshot();
    expect(si.currentLoad).toHaveBeenCalledTimes(2);
  });

  it("only calls networkStats once per snapshot (no double-call-plus-sleep)", async () => {
    const { getSystemSnapshot } = await import("./service");
    await getSystemSnapshot();
    expect(si.networkStats).toHaveBeenCalledTimes(1);
  });

  it("reports null network throughput on the very first sample, then real values afterward", async () => {
    const { getSystemSnapshot } = await import("./service");

    const first = await getSystemSnapshot();
    expect(first.networkDownMbps).toBeNull();
    expect(first.networkUpMbps).toBeNull();

    vi.advanceTimersByTime(6_000);

    const second = await getSystemSnapshot();
    expect(second.networkDownMbps).not.toBeNull();
    expect(second.networkUpMbps).not.toBeNull();
  });

  it("getSystemSnapshot and getSystemDetailSnapshot share the same network warm-up state", async () => {
    const { getSystemSnapshot, getSystemDetailSnapshot } = await import("./service");

    const snapshot = await getSystemSnapshot();
    expect(snapshot.networkDownMbps).toBeNull();

    vi.advanceTimersByTime(6_000);

    const detail = await getSystemDetailSnapshot();
    expect(detail.network[0].downMbps).not.toBeNull();
  });

  it("caches the detail snapshot independently with its own TTL", async () => {
    const { getSystemDetailSnapshot } = await import("./service");

    await getSystemDetailSnapshot();
    await getSystemDetailSnapshot();
    expect(si.osInfo).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6_000);
    await getSystemDetailSnapshot();
    expect(si.osInfo).toHaveBeenCalledTimes(2);
  });
});
