import { cn } from "@/lib/utils";

interface PresenceRingProps {
  size?: "sm" | "lg";
  active?: boolean;
  className?: string;
}

/**
 * JARVIS's signature motif — a circular presence indicator. Small in the
 * sidebar wordmark across every mode, full-size as the ambient listening
 * ring in Focus Mode. One shape, two densities.
 */
export function PresenceRing({ size = "sm", active = false, className }: PresenceRingProps) {
  const dimension = size === "sm" ? 20 : 128;
  const stroke = size === "sm" ? 1.5 : 1.5;
  const radius = dimension / 2 - stroke * 2;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: dimension, height: dimension }}
    >
      {active && (
        <span className="absolute inset-0 animate-pulse rounded-full bg-accent-cyan/10" />
      )}
      <svg
        width={dimension}
        height={dimension}
        viewBox={`0 0 ${dimension} ${dimension}`}
        className="relative"
      >
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className={active ? "text-accent-cyan/70" : "text-border-strong"}
        />
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={size === "sm" ? 2 : 3}
          className={active ? "fill-accent-cyan" : "fill-status-idle"}
        />
      </svg>
    </span>
  );
}
