import { getSystemDetailSnapshot, getSystemSnapshot, type SystemDetailSnapshot } from "./service";
import { formatUptime } from "@/lib/format";
import type { SystemStatus as UiSystemStatus } from "@/lib/data/types";

export async function getUiSystemStatus(): Promise<UiSystemStatus> {
  const snap = await getSystemSnapshot();
  return {
    metrics: [
      { kind: "cpu", label: "CPU", percent: snap.cpuPercent },
      { kind: "gpu", label: "GPU", percent: snap.gpuPercent },
      { kind: "ram", label: "RAM", percent: snap.ramPercent },
      { kind: "disk", label: "Disk", percent: snap.diskPercent },
    ],
    temperatureC: snap.temperatureC,
    uptime: formatUptime(snap.uptimeSeconds),
    networkDownMbps: snap.networkDownMbps,
    networkUpMbps: snap.networkUpMbps,
  };
}

export interface UiSystemDetail extends Omit<SystemDetailSnapshot, "uptimeSeconds"> {
  uptime: string;
}

/** Backs the dedicated System page — the full monitor, not the four-number summary. */
export async function getUiSystemDetail(): Promise<UiSystemDetail> {
  const { uptimeSeconds, ...rest } = await getSystemDetailSnapshot();
  return { ...rest, uptime: formatUptime(uptimeSeconds) };
}
