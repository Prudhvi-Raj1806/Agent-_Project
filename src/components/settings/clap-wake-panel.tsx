"use client";

import { Ear } from "lucide-react";
import { useClapWake } from "@/lib/clap/clap-detector-context";
import { cn } from "@/lib/utils";

export function ClapWakePanel() {
  const { enabled, setEnabled, status } = useClapWake();

  const statusLine = !enabled
    ? "Off."
    : status === "listening"
      ? "Listening for a double-clap."
      : status === "denied"
        ? "Microphone access was denied — allow it in your browser's site settings, then toggle this off and on again."
        : status === "unsupported"
          ? "Not supported in this browser."
          : "Starting…";

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Ear className={cn("size-4", enabled && status === "listening" ? "text-status-success" : "text-text-dim")} />
        <div>
          <p className="text-sm text-foreground">{statusLine}</p>
          <p className="text-xs text-muted-foreground">
            Double-clap opens VS Code + your browser, resumes Spotify, and speaks a greeting. Detection runs entirely
            in your browser — audio is never sent anywhere.
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Listen for double-clap"
        onClick={() => setEnabled(!enabled)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          enabled ? "bg-accent-cyan" : "bg-surface-2"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-background transition-transform",
            enabled && "translate-x-4"
          )}
        />
      </button>
    </div>
  );
}
