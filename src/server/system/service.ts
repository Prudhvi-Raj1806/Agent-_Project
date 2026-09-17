import si from "systeminformation";

/**
 * Real local machine telemetry via `systeminformation`. Every field is
 * genuinely measured — when a signal isn't exposed on this machine (e.g. no
 * GPU-load driver, no temperature sensor), the field is `null` rather than
 * a fabricated number. Network throughput needs two samples to compute a
 * rate, so this call has a short built-in warmup delay.
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const [load, mem, fsSize, graphics, time, temp] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.graphics(),
    si.time(),
    si.cpuTemperature(),
  ]);

  // First call establishes a baseline; the real rate needs a second sample after a short delay.
  await si.networkStats();
  await sleep(200);
  const netStats = await si.networkStats();
  const primaryNet =
    netStats.find((n) => (n.rx_sec ?? 0) > 0 || (n.tx_sec ?? 0) > 0) ?? netStats[0];

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
    networkDownMbps: primaryNet ? round((primaryNet.rx_sec * 8) / 1_000_000) : null,
    networkUpMbps: primaryNet ? round((primaryNet.tx_sec * 8) / 1_000_000) : null,
  };
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

export async function getSystemDetailSnapshot(): Promise<SystemDetailSnapshot> {
  const [load, mem, fsSize, graphics, time, temp, osInfo, battery] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.graphics(),
    si.time(),
    si.cpuTemperature(),
    si.osInfo(),
    si.battery(),
  ]);

  await si.networkStats();
  await sleep(200);
  const netStats = await si.networkStats();
  const gpu = graphics.controllers[0];

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
      downMbps: round((iface.rx_sec * 8) / 1_000_000),
      upMbps: round((iface.tx_sec * 8) / 1_000_000),
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
