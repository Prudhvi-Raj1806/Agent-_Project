"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function toneFor(percent: number) {
  if (percent >= 90) return "bg-status-error";
  if (percent >= 70) return "bg-status-warning";
  return "bg-accent-cyan";
}

interface ProgressBarProps {
  percent: number;
  className?: string;
  /**
   * "risk" (default) colors by how close percent is to 100 — for quota/usage
   * bars where higher is more concerning. "flat" always uses the accent
   * color — for completion/progress bars where higher is simply further along.
   */
  variant?: "risk" | "flat";
}

/** A thin, restrained quota/progress bar. Animates in from 0 on mount. */
export function ProgressBar({ percent, className, variant = "risk" }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped]);

  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-out",
          variant === "flat" ? "bg-accent-cyan" : toneFor(clamped)
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
