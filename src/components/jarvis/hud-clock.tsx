"use client";

import { useEffect, useState } from "react";
import { HudPanel } from "@/components/jarvis/hud-panel";

/** Live time and date. Renders placeholders until mounted so SSR and the first client paint agree. */
export function HudClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const time = now
    ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";
  const day = now ? now.toLocaleDateString("en-US", { weekday: "long" }) : " ";
  const date = now ? now.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : " ";

  return (
    <HudPanel title="Local time">
      <p className="font-mono text-4xl font-light tabular-nums tracking-wider text-foreground">{time}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {day} <span className="text-text-dim">·</span> {date}
      </p>
    </HudPanel>
  );
}
