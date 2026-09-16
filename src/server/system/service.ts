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
