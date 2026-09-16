import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/data/types";

const toneStyles: Record<StatusTone, string> = {
  active: "bg-status-active",
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-error",
  waiting: "bg-status-waiting",
  idle: "bg-status-idle",
};

const toneBorderStyles: Record<StatusTone, string> = {
  active: "border-status-active",
  success: "border-status-success",
  warning: "border-status-warning",
  error: "border-status-error",
  waiting: "border-status-waiting",
  idle: "border-status-idle",
};

const toneText: Record<StatusTone, string> = {
  active: "text-status-active",
  success: "text-status-success",
  warning: "text-status-warning",
  error: "text-status-error",
  waiting: "text-status-waiting",
  idle: "text-text-dim",
};

interface StatusIndicatorProps {
  tone: StatusTone;
  label?: string;
  pulse?: boolean;
  /** false renders a hollow (outline) dot instead of a filled one — for inactive/waiting states. */
  filled?: boolean;
  className?: string;
}

export function StatusIndicator({
  tone,
  label,
  pulse = tone === "active",
  filled = true,
  className,
}: StatusIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex size-1.5">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-40",
              toneStyles[tone]
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex size-1.5 rounded-full",
            filled ? toneStyles[tone] : cn("border", toneBorderStyles[tone])
          )}
        />
      </span>
      {label && (
        <span className={cn("text-[11px] font-medium tracking-wide uppercase", toneText[tone])}>
          {label}
        </span>
      )}
    </span>
  );
}
