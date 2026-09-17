"use client";

import { useEffect, useState } from "react";
import { Battery, BatteryCharging, Clock, HardDrive, MemoryStick, Server, Thermometer, Wifi } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import { RadialMeter } from "@/components/primitives/radial-meter";
import type { UiSystemDetail } from "@/server/system/view";
import { cn } from "@/lib/utils";

const POLL_MS = 3_000;

function barColorClass(percent: number | null): string {
  if (percent === null) return "bg-surface-2";
  if (percent >= 90) return "bg-status-error";
  if (percent >= 70) return "bg-status-warning";
  return "bg-accent-cyan";
}

function UsageBar({ label, right, percent }: { label: string; right: string; percent: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 font-mono text-muted-foreground tabular-nums">{right}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full transition-[width] duration-500", barColorClass(percent))} style={{ width: `${percent ?? 0}%` }} />
      </div>
    </div>
  );
}

function CoreBars({ cores }: { cores: (number | null)[] }) {
  return (
    <div className="flex h-12 items-end gap-1">
      {cores.map((load, i) => (
        <div
          key={i}
          title={`Core ${i}: ${load ?? "—"}%`}
          className="flex h-full w-2 flex-1 flex-col justify-end overflow-hidden rounded-full bg-surface-2"
        >
          <div className={cn("w-full rounded-full transition-[height] duration-500", barColorClass(load))} style={{ height: `${load ?? 0}%` }} />
        </div>
      ))}
    </div>
  );
}

export function SystemMonitorView({ initialDetail }: { initialDetail: UiSystemDetail }) {
  const [detail, setDetail] = useState(initialDetail);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/system/detail");
        const data = await res.json();
        if (!cancelled) setDetail(data.detail);
      } catch {
        // Keep showing the last good snapshot rather than blanking the page.
      }
    }
    const interval = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const { cpu, memory, gpu, disks, network, os, battery, temperatureC, uptime } = detail;
  const activeNetwork = network.filter((n) => (n.downMbps ?? 0) > 0 || (n.upMbps ?? 0) > 0);
  const shownNetwork = activeNetwork.length > 0 ? activeNetwork : network.slice(0, 3);

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr] gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <Panel>
          <PanelHeader title="Overview" subtitle="Live, polled every few seconds" />
          <PanelBody className="flex flex-col justify-center pt-4">
            <div className="flex items-center justify-around">
              <RadialMeter label="CPU" percent={cpu.percent} size={76} />
              <RadialMeter label="GPU" percent={gpu.percent} size={76} />
              <RadialMeter label="RAM" percent={memory.percent} size={76} />
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Thermometer className="size-3.5" />
                <span className="font-mono text-[11px] text-foreground">
                  {temperatureC !== null ? `${temperatureC}°C` : "—"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="size-3.5" />
                <span className="font-mono text-[11px] text-foreground">{uptime}</span>
              </div>
              {battery && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  {battery.isCharging ? <BatteryCharging className="size-3.5" /> : <Battery className="size-3.5" />}
                  <span className="font-mono text-[11px] text-foreground">{battery.percent}%</span>
                </div>
              )}
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader icon={<MemoryStick className="size-3.5 text-muted-foreground" />} title="Memory" />
          <PanelBody className="flex flex-col justify-center gap-3">
            <UsageBar label="RAM" right={`${memory.usedGB}GB / ${memory.totalGB}GB`} percent={memory.percent} />
            <p className="text-[11px] text-muted-foreground">{memory.availableGB}GB available</p>
            {memory.swapTotalGB > 0 && (
              <UsageBar
                label="Swap"
                right={`${memory.swapUsedGB}GB / ${memory.swapTotalGB}GB`}
                percent={Math.round((memory.swapUsedGB / memory.swapTotalGB) * 100)}
              />
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader icon={<Server className="size-3.5 text-muted-foreground" />} title="Machine" subtitle={os.hostname} />
          <PanelBody className="flex flex-col justify-center gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">OS</span>
              <span className="font-mono text-foreground">{os.distro}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Kernel</span>
              <span className="truncate font-mono text-foreground">{os.kernel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Arch</span>
              <span className="font-mono text-foreground">{os.arch}</span>
            </div>
            {gpu.model && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">GPU</span>
                <span className="truncate font-mono text-foreground">{gpu.model}</span>
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <Panel>
          <PanelHeader title="CPU cores" subtitle={`${cpu.cores.length} logical cores`} />
          <PanelBody className="flex items-center">
            <CoreBars cores={cpu.cores} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader icon={<HardDrive className="size-3.5 text-muted-foreground" />} title="Disks" />
          <PanelBody className="flex flex-col justify-center gap-3 overflow-y-auto">
            {disks.map((disk) => (
              <UsageBar key={disk.mount} label={disk.mount} right={`${disk.usedGB}GB / ${disk.totalGB}GB`} percent={disk.percent} />
            ))}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader icon={<Wifi className="size-3.5 text-muted-foreground" />} title="Network" />
          <PanelBody className="flex flex-col justify-center gap-3 overflow-y-auto">
            {shownNetwork.length === 0 && <p className="text-xs text-muted-foreground">No active interfaces.</p>}
            {shownNetwork.map((iface) => (
              <div key={iface.iface} className="flex items-center justify-between text-xs">
                <span className="truncate font-medium text-foreground">{iface.iface}</span>
                <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                  {iface.downMbps !== null && iface.upMbps !== null ? `↓ ${iface.downMbps} ↑ ${iface.upMbps} Mbps` : "—"}
                </span>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
