import { cn } from "@/lib/utils";

interface RadialMeterProps {
  label: string;
  /** null renders an honest "—" (unavailable signal on this machine) instead of a fabricated ring. */
  percent: number | null;
  size?: number;
  className?: string;
}

function strokeClassFor(percent: number) {
  if (percent >= 90) return "text-status-error";
  if (percent >= 70) return "text-status-warning";
  return "text-accent-cyan";
}

export function RadialMeter({ label, percent, size = 56, className }: RadialMeterProps) {
  const stroke = 3;
  const radius = size / 2 - stroke;
  const circumference = 2 * Math.PI * radius;
  const available = percent !== null;
  const clamped = available ? Math.min(100, Math.max(0, percent)) : 0;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-surface-2"
          />
          {available && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className={cn("transition-[stroke-dashoffset] duration-500 ease-out", strokeClassFor(clamped))}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-foreground tabular-nums">
          {available ? `${clamped}%` : "—"}
        </div>
      </div>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
