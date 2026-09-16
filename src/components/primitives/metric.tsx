import { cn } from "@/lib/utils";

interface MetricProps {
  label: string;
  percent: number;
  className?: string;
}

/**
 * Bar color is derived from the value, never assigned arbitrarily — cyan
 * and amber/red are reserved for metrics that actually warrant attention.
 */
function fillClassFor(percent: number) {
  if (percent >= 90) return "bg-status-error";
  if (percent >= 70) return "bg-status-warning";
  return "bg-white/25";
}

export function Metric({ label, percent, className }: MetricProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            fillClassFor(percent)
          )}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-xs text-foreground tabular-nums">
        {percent}%
      </span>
    </div>
  );
}
