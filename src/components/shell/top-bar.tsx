"use client";

import { useEffect, useState } from "react";
import { CommandBar } from "@/components/primitives/command-bar";
import { NotificationBell } from "@/components/shell/notification-bell";
import { WeatherChip } from "@/components/shell/weather-chip";
import type { WeatherStatus } from "@/lib/data/types";
import { formatClock, formatDayDate } from "@/lib/format";
import { useClock } from "@/lib/use-clock";

export function TopBar() {
  const now = useClock();
  const [weather, setWeather] = useState<WeatherStatus | null>(null);

  useEffect(() => {
    const load = () => {
      fetch("/api/weather")
        .then((res) => res.json())
        .then((data) => setWeather(data.weather ?? null))
        .catch(() => {});
    };
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-border px-6">
      <CommandBar className="max-w-lg flex-1" />
      <div className="hidden shrink-0 flex-col items-end leading-tight sm:flex">
        <span className="text-xs text-muted-foreground">
          {now ? formatDayDate(now) : " "}
        </span>
        <span className="text-sm text-foreground tabular-nums">
          {now ? formatClock(now) : " "}
        </span>
      </div>
      <WeatherChip weather={weather} />
      <NotificationBell />
    </header>
  );
}
