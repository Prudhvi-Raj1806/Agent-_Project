import si from "systeminformation";

/**
 * Real local machine telemetry via `systeminformation`. Every field is
 * genuinely measured — when a signal isn't exposed on this machine (e.g. no
 * GPU-load driver, no temperature sensor), the field is `null` rather than
 * a fabricated number.
 *
 * Performance note: several `systeminformation` calls (`graphics`,
 * `networkStats`, `osInfo`, `battery`, `cpuTemperature`) are genuinely slow
 * on Windows (measured 1-4s each, some backed by WMI queries that spawn a
 * child process) — a cold, uncached snapshot can take 8-20s. Every snapshot
 * is therefore cached with a short TTL and in-flight calls are shared, so
 * concurrent requests (a page load racing a poll, two open tabs) never
 * trigger more than one real `systeminformation` pass at a time.
 */
export interface SystemSnapshot {
  cpuPercent: number | null;
  gpuPercent: number | null;
  ramPercent: number | null;
  diskPercent: number | null;
  temperatureC: number | null;
  uptimeSeconds: number;
  networkDownMbps: number | null;
  networkUpMbps: number | null;
}

function round(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

// networkStats() only yields a real rx_sec/tx_sec once systeminformation has
// a prior sample to diff against — rather than blocking every request on an
// extra call + artificial sleep to manufacture that second sample, this
// reuses the natural spacing between our own cached snapshots as the delay.
// The very first snapshot taken by EITHER getSystemSnapshot or
// getSystemDetailSnapshot in this process reports null network throughput
// (honest "not yet measurable"), and every snapshot after that is accurate.
let networkWarmed = false;

/** Returns true once (across the whole process), then false forever after. */
function consumeFirstSampleFlag(): boolean {
  if (networkWarmed) return false;
  networkWarmed = true;
  return true;
}

async function sampleNetwork(): Promise<{ downMbps: number | null; upMbps: number | null }> {
  const netStats = await si.networkStats();
  const primary = netStats.find((n) => (n.rx_sec ?? 0) > 0 || (n.tx_sec ?? 0) > 0) ?? netStats[0];
  if (consumeFirstSampleFlag()) return { downMbps: null, upMbps: null };
  return {
    downMbps: primary ? round((primary.rx_sec * 8) / 1_000_000) : null,
    upMbps: primary ? round((primary.tx_sec * 8) / 1_000_000) : null,
  };
}

/** Shares one in-flight computation across concurrent callers and caches the result for `ttlMs`. */
function cached<T>(ttlMs: number) {
  let entry: { value: T; expiresAt: number } | null = null;
  let inFlight: Promise<T> | null = null;
  return (compute: () => Promise<T>): Promise<T> => {
    if (entry && Date.now() < entry.expiresAt) return Promise.resolve(entry.value);
    if (inFlight) return inFlight;
    inFlight = compute()
      .then((value) => {
        entry = { value, expiresAt: Date.now() + ttlMs };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}

const SNAPSHOT_TTL_MS = 5_000;
const withSnapshotCache = cached<SystemSnapshot>(SNAPSHOT_TTL_MS);

async function computeSystemSnapshot(): Promise<SystemSnapshot> {
  const [load, mem, fsSize, graphics, time, temp, network] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.graphics(),
    si.time(),
    si.cpuTemperature(),
    sampleNetwork(),
  ]);

  const primaryDisk = fsSize.reduce<(typeof fsSize)[number] | undefined>(
    (largest, d) => (d.size > (largest?.size ?? 0) ? d : largest),
    undefined
  );
  const gpu = graphics.controllers[0];

  return {
    cpuPercent: round(load.currentLoad),
    gpuPercent: round(gpu?.utilizationGpu),
    ramPercent: mem.total > 0 ? round((mem.active / mem.total) * 100) : null,
    diskPercent: round(primaryDisk?.use),
    temperatureC: round(temp.main),
    uptimeSeconds: time.uptime,
    networkDownMbps: network.downMbps,
    networkUpMbps: network.upMbps,
  };
}

export function getSystemSnapshot(): Promise<SystemSnapshot> {
  return withSnapshotCache(computeSystemSnapshot);
}

/** The richer snapshot behind the dedicated System page — every filesystem and
 * network interface, per-core CPU load, and machine identity, not just the
 * four-number summary the compact home/work panel shows. Same honesty rule:
 * unmeasurable signals are `null`/omitted, never guessed. */
export interface SystemDetailSnapshot {
  cpu: { percent: number | null; cores: (number | null)[] };
  memory: {
    percent: number | null;
    usedGB: number;
    totalGB: number;
    availableGB: number;
    swapUsedGB: number;
    swapTotalGB: number;
  };
  gpu: { percent: number | null; model: string | null };
  disks: { mount: string; usedGB: number; totalGB: number; percent: number | null }[];
  network: { iface: string; downMbps: number | null; upMbps: number | null }[];
  os: { platform: string; distro: string; arch: string; hostname: string; kernel: string };
  battery: { percent: number; isCharging: boolean } | null;
  temperatureC: number | null;
  uptimeSeconds: number;
}

function toGB(bytes: number | undefined): number {
  return typeof bytes === "number" && Number.isFinite(bytes) ? Math.round((bytes / 1_073_741_824) * 10) / 10 : 0;
}

const DETAIL_TTL_MS = 5_000;
const withDetailCache = cached<SystemDetailSnapshot>(DETAIL_TTL_MS);

async function computeSystemDetailSnapshot(): Promise<SystemDetailSnapshot> {
  const [load, mem, fsSize, graphics, time, temp, osInfo, battery, netStats] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.graphics(),
    si.time(),
    si.cpuTemperature(),
    si.osInfo(),
    si.battery(),
    si.networkStats(),
  ]);

  const gpu = graphics.controllers[0];
  const networkIsWarm = !consumeFirstSampleFlag();

  return {
    cpu: {
      percent: round(load.currentLoad),
      cores: load.cpus.map((core) => round(core.load)),
    },
    memory: {
      percent: mem.total > 0 ? round((mem.active / mem.total) * 100) : null,
      usedGB: toGB(mem.active),
      totalGB: toGB(mem.total),
      availableGB: toGB(mem.available),
      swapUsedGB: toGB(mem.swapused),
      swapTotalGB: toGB(mem.swaptotal),
    },
    gpu: { percent: round(gpu?.utilizationGpu), model: gpu?.model ?? null },
    disks: fsSize
      .filter((disk) => disk.size > 0)
      .map((disk) => ({
        mount: disk.mount,
        usedGB: toGB(disk.used),
        totalGB: toGB(disk.size),
        percent: round(disk.use),
      })),
    network: netStats.map((iface) => ({
      iface: iface.iface,
      downMbps: networkIsWarm ? round((iface.rx_sec * 8) / 1_000_000) : null,
      upMbps: networkIsWarm ? round((iface.tx_sec * 8) / 1_000_000) : null,
    })),
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      arch: osInfo.arch,
      hostname: osInfo.hostname,
      kernel: osInfo.kernel,
    },
    battery: battery.hasBattery ? { percent: Math.round(battery.percent), isCharging: battery.isCharging } : null,
    temperatureC: round(temp.main),
    uptimeSeconds: time.uptime,
  };
}

export function getSystemDetailSnapshot(): Promise<SystemDetailSnapshot> {
  return withDetailCache(computeSystemDetailSnapshot);
}
