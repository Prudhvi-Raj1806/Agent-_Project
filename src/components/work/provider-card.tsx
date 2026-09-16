"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import type { Provider, ProviderStatus, StatusTone } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const statusToneMap: Record<ProviderStatus, StatusTone> = {
  online: "success",
  degraded: "warning",
  rate_limited: "warning",
  offline: "error",
};

const statusLabelMap: Record<ProviderStatus, string> = {
  online: "Online",
  degraded: "Degraded",
  rate_limited: "Rate limited",
  offline: "Offline",
};

function MetricRow({ label, percent }: { label: string; percent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground tabular-nums">{percent}%</span>
      </div>
      <ProgressBar percent={percent} className="mt-1" />
    </div>
  );
}

export function ProviderCard({ provider }: { provider: Provider }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border bg-surface-2/60 p-2.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-foreground">{provider.name}</h4>
            <StatusIndicator
              tone={statusToneMap[provider.status]}
              label={statusLabelMap[provider.status]}
              pulse={false}
            />
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {provider.accounts.length} account{provider.accounts.length === 1 ? "" : "s"} &middot; next
            reset {provider.resetIn}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      <div className="mt-2">
        <MetricRow label="Combined quota" percent={provider.aggregateQuotaPercent} />
      </div>

      {expanded && (
        <div className="mt-2.5 space-y-2.5 border-t border-border pt-2.5">
          <div>
            <p className="text-[10px] font-medium tracking-wide text-text-dim uppercase">Models</p>
            <div className="mt-1.5 space-y-1.5">
              {provider.metrics.map((metric) => (
                <MetricRow key={metric.label} label={metric.label} percent={metric.percent} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-medium tracking-wide text-text-dim uppercase">
              Accounts
            </p>
            <div className="mt-1.5 space-y-1.5">
              {provider.accounts.map((account) => (
                <MetricRow key={account.id} label={account.label} percent={account.quotaPercent} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
