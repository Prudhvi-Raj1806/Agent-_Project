import { Clock, Cpu, Thermometer, Wifi } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import { RadialMeter } from "@/components/primitives/radial-meter";
import type { SystemStatus } from "@/lib/data/types";

export function SystemPanel({ status, className }: { status: SystemStatus; className?: string }) {
  return (
    <Panel className={className}>
      <PanelHeader
        icon={
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-status-warning text-background">
            <Cpu className="size-2.5" strokeWidth={2.5} />
          </span>
        }
        title="System"
        subtitle="All systems nominal"
      />
      <PanelBody className="flex flex-col justify-center pt-4">
        <div className="flex items-center justify-around">
          {status.metrics.map((metric) => (
            <RadialMeter key={metric.kind} label={metric.label} percent={metric.percent} size={60} />
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Thermometer className="size-3.5" />
            <span className="font-mono text-[11px] text-foreground">
              {status.temperatureC !== null ? `${status.temperatureC}°C` : "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Wifi className="size-3.5" />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-wide">Network</p>
              <p className="font-mono text-[11px] text-foreground">
                {status.networkDownMbps !== null && status.networkUpMbps !== null
                  ? `↓ ${status.networkDownMbps} ↑ ${status.networkUpMbps} Mbps`
                  : "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-wide">Uptime</p>
              <p className="font-mono text-[11px] text-foreground">{status.uptime}</p>
            </div>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}
