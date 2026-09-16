import { cn } from "@/lib/utils";

interface TimerRingProps {
  size: number;
  strokeWidth?: number;
  /** 0-1. Defaults to a full ring (session time available, not yet elapsed). */
  progress?: number;
  className?: string;
  children?: React.ReactNode;
}

/** A circular countdown ring with centered content — shared by Work's compact timer and Focus Mode's hero timer. */
export function TimerRing({ size, strokeWidth = 4, progress = 1, className, children }: TimerRingProps) {
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = circumference * (1 - clamped);

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-surface-2"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-accent-cyan transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
