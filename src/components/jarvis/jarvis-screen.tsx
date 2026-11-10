"use client";

import { useMemo, useState } from "react";
import { Cloud, CloudRain, CloudSnow, Mic, SendHorizontal, Sun, Square } from "lucide-react";
import { HudClock } from "@/components/jarvis/hud-clock";
import { HudPanel } from "@/components/jarvis/hud-panel";
import { HudRings } from "@/components/jarvis/hud-rings";
import { JarvisGlobe } from "@/components/jarvis/jarvis-globe";
import { buildBriefing } from "@/lib/jarvis/briefing";
import { useJarvisVoice, type JarvisVoiceState } from "@/lib/jarvis/use-jarvis-voice";
import type { NewsItem, ScheduleItem, SystemStatus, WeatherCondition, WeatherStatus } from "@/lib/data/types";
import { cn } from "@/lib/utils";

interface JarvisScreenProps {
  system: SystemStatus;
  schedule: ScheduleItem[];
  weather: WeatherStatus | null;
  news: NewsItem[];
}

const weatherIcon: Record<WeatherCondition, typeof Sun> = {
  clear: Sun,
  clouds: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
};

const stateLabel: Record<JarvisVoiceState, string> = {
  idle: "Standing by",
  thinking: "Processing",
  speaking: "Speaking",
};

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
      <span className="uppercase tracking-wider text-text-dim">{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function MetricBar({ label, percent }: { label: string; percent: number | null }) {
  const tone =
    percent === null
      ? "bg-surface-3"
      : percent >= 90
        ? "bg-status-error"
        : percent >= 70
          ? "bg-status-warning"
          : "bg-accent-cyan";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between font-mono text-[11px]">
        <span className="uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">{percent === null ? "—" : `${percent}%`}</span>
      </div>
      <div className="h-1 w-full bg-surface-3">
        <div
          className={cn("h-full transition-[width] duration-500 ease-out", tone)}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export function JarvisScreen({ system, schedule, weather, news }: JarvisScreenProps) {
  const voice = useJarvisVoice();
  const [draft, setDraft] = useState("");

  const briefing = useMemo(() => () => buildBriefing({ now: new Date(), system, schedule, weather }), [
    system,
    schedule,
    weather,
  ]);

  const busy = voice.state !== "idle";
  const WeatherIcon = weather ? weatherIcon[weather.condition] : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    voice.speak(text);
    setDraft("");
  };

  return (
    <div className="relative grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden px-6 py-5 lg:grid-cols-[minmax(240px,290px)_minmax(0,1fr)_minmax(240px,290px)]">
      {/* Left rail */}
      <div className="hidden min-h-0 flex-col gap-4 overflow-hidden lg:flex">
        <HudClock />
        <HudPanel title="System" meta={`UP ${system.uptime}`}>
          <div className="flex flex-col gap-3">
            {system.metrics.map((m) => (
              <MetricBar key={m.kind} label={m.label} percent={m.percent} />
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
            <Readout label="Temp" value={system.temperatureC !== null ? `${system.temperatureC}°C` : "—"} />
            <Readout
              label="Net"
              value={
                system.networkDownMbps !== null && system.networkUpMbps !== null
                  ? `↓ ${system.networkDownMbps} ↑ ${system.networkUpMbps} Mbps`
                  : "—"
              }
            />
          </div>
        </HudPanel>
      </div>

      {/* Centre: the globe */}
      <div className="relative flex min-h-0 flex-col items-center justify-center">
        <div className="relative aspect-square w-full max-w-[min(100%,calc(100dvh-15rem))]">
          <HudRings className="absolute inset-0 size-full opacity-80" />
          <JarvisGlobe levelRef={voice.levelRef} state={voice.state} className="absolute inset-0 size-full" />
        </div>

        <div className="mt-1 flex w-full max-w-xl flex-col items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em]">
            <span
              className={cn(
                "size-1.5 rounded-full",
                voice.state === "speaking"
                  ? "bg-accent-cyan shadow-[0_0_8px_var(--jarvis-cyan)]"
                  : voice.state === "thinking"
                    ? "animate-pulse bg-status-waiting"
                    : "bg-status-idle",
              )}
            />
            <span className="text-accent-cyan">Jarvis</span>
            <span className="text-text-dim">/</span>
            <span className="text-muted-foreground">{stateLabel[voice.state]}</span>
          </div>

          <p
            className="min-h-10 max-w-lg text-center text-sm leading-snug text-muted-foreground"
            aria-live="polite"
          >
            {voice.caption || "Ask me to speak, or press Brief me."}
          </p>

          <form
            onSubmit={submit}
            className="flex w-full items-center gap-2 border border-accent-cyan/20 bg-glass px-3 py-2 backdrop-blur-sm"
          >
            <Mic className="size-4 shrink-0 text-text-dim" aria-hidden="true" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type something for Jarvis to say…"
              aria-label="Text for Jarvis to speak"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-text-dim"
            />
            {busy ? (
              <button
                type="button"
                onClick={voice.stop}
                aria-label="Stop speaking"
                className="flex size-7 items-center justify-center text-status-warning transition-colors hover:bg-surface-3"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Speak"
                className="flex size-7 items-center justify-center text-accent-cyan transition-colors hover:bg-surface-3 disabled:text-text-dim disabled:hover:bg-transparent"
              >
                <SendHorizontal className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => voice.speak(briefing())}
              disabled={busy}
              className="border border-accent-cyan/30 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-accent-cyan transition-colors hover:bg-accent-cyan/10 disabled:opacity-40"
            >
              Brief me
            </button>
          </form>
        </div>
      </div>

      {/* Right rail */}
      <div className="hidden min-h-0 flex-col gap-4 overflow-hidden lg:flex">
        <HudPanel title="Weather">
          {weather && WeatherIcon ? (
            <div className="flex items-center gap-3">
              <WeatherIcon className="size-8 text-accent-cyan" strokeWidth={1.4} />
              <div>
                <p className="font-mono text-3xl font-light tabular-nums text-foreground">{weather.temperatureC}°</p>
                <p className="text-xs text-muted-foreground">{weather.label}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-dim">Weather unavailable.</p>
          )}
        </HudPanel>

        <HudPanel title="Schedule" meta={`${schedule.length} upcoming`}>
          {schedule.length === 0 ? (
            <p className="text-xs text-text-dim">Nothing scheduled.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {schedule.slice(0, 4).map((item) => (
                <li key={item.id} className="flex items-baseline gap-3">
                  <span className="w-16 shrink-0 font-mono text-[11px] tabular-nums text-accent-cyan">{item.time}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.title}</span>
                  {item.day === "tomorrow" && (
                    <span className="font-mono text-[10px] uppercase text-text-dim">Tmrw</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </HudPanel>

        <HudPanel title="Feed" meta="Live" className="min-h-0 flex-1 overflow-hidden">
          {news.length === 0 ? (
            <p className="text-xs text-text-dim">No headlines right now.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {news.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <p className="line-clamp-2 text-[13px] leading-snug text-foreground">{item.title}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">{item.source}</p>
                </li>
              ))}
            </ul>
          )}
        </HudPanel>
      </div>
    </div>
  );
}
