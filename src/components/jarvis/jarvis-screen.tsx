"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AudioLines, Cloud, CloudRain, CloudSnow, Mic, SendHorizontal, Square, Sun } from "lucide-react";
import { HudApproval } from "@/components/jarvis/hud-approval";
import { HudClock } from "@/components/jarvis/hud-clock";
import { HudNowPlaying } from "@/components/jarvis/hud-now-playing";
import { HudPanel } from "@/components/jarvis/hud-panel";
import { HudRings } from "@/components/jarvis/hud-rings";
import { JarvisGlobe } from "@/components/jarvis/jarvis-globe";
import { QuickDock } from "@/components/jarvis/quick-dock";
import { buildBriefing } from "@/lib/jarvis/briefing";
import {
  browserMissionRunDeps,
  resumeMissionToSettled,
  runMissionToSettled,
  submitToolApproval,
} from "@/lib/jarvis/mission-run";
import { SLOW_NOTICE_MS, askBrain, nextHistory, type BrainResponse, type Exchange } from "@/lib/jarvis/brain-run";
import { missionSpeech } from "@/lib/jarvis/mission-speech";
import { useJarvisVoice, type JarvisVoiceState } from "@/lib/jarvis/use-jarvis-voice";
import { useSpeechInput } from "@/lib/jarvis/use-speech-input";
import { useAppSettings } from "@/lib/settings/app-settings-context";
import type { NewsItem, ScheduleItem, SystemStatus, WeatherCondition, WeatherStatus } from "@/lib/data/types";
import type { Mission, PendingToolApproval } from "@/server/missions/types";
import { cn } from "@/lib/utils";
import { useBrand, useOwnerName } from "@/lib/settings/use-brand";

interface JarvisScreenProps {
  system: SystemStatus;
  schedule: ScheduleItem[];
  weather: WeatherStatus | null;
  news: NewsItem[];
}

interface VoiceStatus {
  speech: "kokoro" | "voicestudio" | "elevenlabs" | "browser";
  handy: { installed: boolean; running: boolean };
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

const speechLabel: Record<VoiceStatus["speech"], string> = {
  kokoro: "Kokoro",
  voicestudio: "VoiceStudio",
  elevenlabs: "ElevenLabs",
  browser: "Browser voice",
};

const AUTO_SEND_DELAY_MS = 700;

/** True when the page was opened on this PC itself, rather than from another device such as the phone. */
function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
}

const subscribeNever = () => () => {};

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

function StatusChip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim">
      <span className={cn("size-1.5 rounded-full", ok ? "bg-status-success" : "bg-status-idle")} />
      {label}
      <span className={ok ? "text-muted-foreground" : "text-text-dim"}>{value}</span>
    </span>
  );
}

function handyChipValue(handy: VoiceStatus["handy"] | undefined): { value: string; ok: boolean } {
  if (!handy) return { value: "…", ok: false };
  if (!handy.installed) return { value: "not installed", ok: false };
  return handy.running ? { value: "ready", ok: true } : { value: "not running", ok: false };
}

export function JarvisScreen({ system, schedule, weather, news }: JarvisScreenProps) {
  const { settings, update } = useAppSettings();
  const brand = useBrand();
  const ownerName = useOwnerName();
  // Phone (or any other device) vs this PC: Handy only exists on the PC, and replies can play here or there.
  const remote = useSyncExternalStore(
    subscribeNever,
    () => !isLocalHost(window.location.hostname),
    () => false,
  );
  const playOnPc = settings["voice.replyDevice"] === "pc";
  const voice = useJarvisVoice({ playOnPc });
  const { setThinking, speak, stop: stopVoice } = voice;
  const [draft, setDraft] = useState("");
  const [heard, setHeard] = useState("");
  const [working, setWorking] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [autoSend, setAutoSend] = useState(settings["voice.autoSendDictation"]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastMissionId, setLastMissionId] = useState<string | null>(null);
  /** Who answered the last request, shown as a small tag so a wrong hand-off (or a missing one) is visible. */
  const [answeredBy, setAnsweredBy] = useState<"Mini brain" | "Hermes" | null>(null);
  /** The last three chat exchanges, sent with each request. Lives only as long as this page. */
  const historyRef = useRef<Exchange[]>([]);
  const [pendingApproval, setPendingApproval] = useState<{ missionId: string; approval: PendingToolApproval } | null>(
    null,
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const runRef = useRef<AbortController | null>(null);
  const autoSendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const briefing = useMemo(() => () => buildBriefing({ now: new Date(), ownerName, system, schedule, weather }), [
    ownerName,
    system,
    schedule,
    weather,
  ]);

  // Voice/Handy availability for the status chips.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      document.hidden
        ? Promise.resolve()
        : fetch("/api/voice/status")
        .then((res) => (res.ok ? (res.json() as Promise<VoiceStatus>) : null))
        .then((data) => {
          if (!cancelled && data) setVoiceStatus(data);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Land focus in the box so Handy's push-to-talk hotkey pastes straight into it.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(
    () => () => {
      runRef.current?.abort();
      if (autoSendTimer.current) clearTimeout(autoSendTimer.current);
    },
    [],
  );

  /**
   * Runs one stretch of mission work (creating it, or resuming after an
   * approval), then says what actually happened. A mission that stops to wait
   * on the owner puts its approval on screen instead of just announcing it.
   */
  const track = useCallback(
    async (run: (signal: AbortSignal) => Promise<Mission>) => {
      runRef.current?.abort();
      const controller = new AbortController();
      runRef.current = controller;

      setNotice(null);
      setLastMissionId(null);
      setWorking(true);
      setThinking(true);
      try {
        const mission = await run(controller.signal);
        if (controller.signal.aborted) return;
        setLastMissionId(mission.id);
        setThinking(false);
        setPendingApproval(
          mission.status === "WAITING_USER" && mission.pendingToolApproval
            ? { missionId: mission.id, approval: mission.pendingToolApproval }
            : null,
        );
        speak(missionSpeech(mission));
      } catch (err) {
        if (controller.signal.aborted) return;
        setThinking(false);
        const reason = err instanceof Error ? err.message : "Something went wrong.";
        setNotice(reason);
        speak(`I couldn't do that. ${reason}`);
      } finally {
        if (runRef.current === controller) {
          runRef.current = null;
          setWorking(false);
        }
      }
    },
    [setThinking, speak],
  );

  const ask = useCallback(
    async (text: string) => {
      const objective = text.trim();
      if (!objective) return;
      if (pendingApproval) {
        setNotice("Answer the pending approval first.");
        return;
      }
      setHeard(objective);

      // The mini brain hears every request first. It answers itself, or hands the request to Hermes.
      runRef.current?.abort();
      const controller = new AbortController();
      runRef.current = controller;
      setNotice(null);
      setLastMissionId(null);
      setAnsweredBy(null);
      setWorking(true);
      setThinking(true);
      const slow = setTimeout(() => {
        if (!controller.signal.aborted) speak("One moment.");
      }, SLOW_NOTICE_MS);

      let answer: BrainResponse | null = null;
      try {
        answer = await askBrain(objective, historyRef.current, controller.signal);
      } catch {
        // The brain's route couldn't be reached at all; fall back to a plain mission below.
      } finally {
        clearTimeout(slow);
      }
      if (controller.signal.aborted) return;

      if (!answer) {
        setAnsweredBy("Hermes");
        await track((signal) => runMissionToSettled(objective, browserMissionRunDeps(), signal));
        return;
      }

      if (answer.kind === "handoff") {
        const { missionId, notice: handoffNotice, text: handoffLine } = answer;
        setAnsweredBy("Hermes");
        if (handoffLine) speak(handoffLine);
        // track() clears the notice as it starts, so the brain's notice is set just after.
        const followed = track((signal) => resumeMissionToSettled(missionId, browserMissionRunDeps(), signal));
        if (handoffNotice) setNotice(handoffNotice);
        await followed;
        return;
      }

      if (runRef.current === controller) {
        runRef.current = null;
        setWorking(false);
      }
      setThinking(false);
      setAnsweredBy("Mini brain");
      speak(answer.text);
      if (answer.kind === "reply" && answer.choice === "chat" && answer.ok) {
        historyRef.current = nextHistory(historyRef.current, objective, answer.text);
      }
    },
    [pendingApproval, setThinking, speak, track],
  );

  /** Sends the owner's ALLOW/DENY, then carries on waiting for the mission to settle again. */
  const decideApproval = useCallback(
    async (approved: boolean) => {
      if (!pendingApproval) return;
      const { missionId, approval } = pendingApproval;
      setPendingApproval(null);
      await track(async (signal) => {
        await submitToolApproval(missionId, approval.toolCallId, approved);
        return resumeMissionToSettled(missionId, browserMissionRunDeps(), signal, {
          answeredToolCallId: approval.toolCallId,
        });
      });
    },
    [pendingApproval, track],
  );

  const submitDraft = useCallback(() => {
    const text = draft.trim();
    if (!text || working) return;
    if (pendingApproval) {
      setNotice("Answer the pending approval first.");
      return;
    }
    setDraft("");
    void ask(text);
  }, [ask, draft, pendingApproval, working]);

  const stopAll = () => {
    runRef.current?.abort();
    runRef.current = null;
    setWorking(false);
    setThinking(false);
    stopVoice();
    if (playOnPc) void fetch("/api/voice/stop-pc", { method: "POST" }).catch(() => {});
    speechInput.stop();
  };

  const toggleDictation = async () => {
    setNotice(null);
    inputRef.current?.focus();
    try {
      const res = await fetch("/api/voice/dictate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setDictating(false);
        setNotice(data.error ?? "Couldn't reach Handy.");
        return;
      }
      setDictating((on) => !on);
    } catch {
      setDictating(false);
      setNotice("Couldn't reach Handy.");
    }
  };

  // Handy delivers dictation by pasting; with auto-send on, a paste submits shortly after it lands.
  const onPaste = () => {
    if (!autoSend) return;
    setDictating(false);
    if (autoSendTimer.current) clearTimeout(autoSendTimer.current);
    autoSendTimer.current = setTimeout(() => {
      const text = inputRef.current?.value.trim();
      if (text) {
        setDraft("");
        void ask(text);
      }
    }, AUTO_SEND_DELAY_MS);
  };

  const busy = working || voice.state !== "idle";
  const WeatherIcon = weather ? weatherIcon[weather.condition] : null;
  const handyChip = handyChipValue(voiceStatus?.handy);
  const handyReady = Boolean(voiceStatus?.handy.running);

  // On the phone the mic uses the browser's speech recognition; on the PC, Handy.
  const speechInput = useSpeechInput((text) => {
    if (autoSend) {
      void ask(text);
    } else {
      setDraft(text);
      inputRef.current?.focus();
    }
  });
  const micActive = remote ? speechInput.listening : dictating;
  const micReady = remote ? speechInput.supported : handyReady;

  const captionText =
    voice.caption || (working ? "Working on it…" : "Type a request, dictate it with Handy, or tap Brief.");

  return (
    <div className="relative grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden px-3 py-3 sm:px-6 sm:py-5 lg:grid-cols-[minmax(240px,290px)_minmax(0,1fr)_minmax(240px,290px)]">
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
        <div className="relative aspect-square w-full max-w-[min(100%,calc(100dvh-24rem))]">
          <HudRings className="absolute inset-0 size-full opacity-80" />
          <JarvisGlobe levelRef={voice.levelRef} state={voice.state} className="absolute inset-0 size-full" />
        </div>

        <div className="mt-1 flex w-full max-w-xl flex-col items-center gap-2.5">
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
            <span className="text-accent-cyan">{brand}</span>
            <span className="text-text-dim">/</span>
            <span className="text-muted-foreground">{stateLabel[voice.state]}</span>
          </div>

          <div className="flex min-h-14 max-w-lg flex-col items-center gap-1 text-center" aria-live="polite">
            {heard && (
              <p className="text-xs text-text-dim">
                <span className="font-mono uppercase tracking-wider">You</span> · {heard}
              </p>
            )}
            <p className="text-sm leading-snug text-muted-foreground">{captionText}</p>
            {answeredBy && !working && (
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{answeredBy}</p>
            )}
            {notice && <p className="text-xs text-status-warning">{notice}</p>}
            {lastMissionId && !working && (
              <Link
                href="/work"
                className="font-mono text-[10px] uppercase tracking-wider text-accent-cyan/80 hover:text-accent-cyan"
              >
                Open in Work →
              </Link>
            )}
          </div>

          {pendingApproval && (
            <HudApproval approval={pendingApproval.approval} busy={working} onDecide={decideApproval} />
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitDraft();
            }}
            className={cn(
              "flex w-full items-center gap-2 border bg-glass px-3 py-2 backdrop-blur-sm transition-colors",
              micActive ? "border-accent-cyan/60" : "border-accent-cyan/20",
            )}
          >
            <button
              type="button"
              onClick={remote ? speechInput.toggle : toggleDictation}
              disabled={!micReady}
              aria-label={
                micActive ? "Stop dictation" : remote ? "Dictate on this phone" : "Dictate with Handy"
              }
              aria-pressed={micActive}
              title={
                micReady
                  ? micActive
                    ? remote
                      ? "Stop listening"
                      : "Stop — Handy will paste what you said"
                    : remote
                      ? "Dictate on this phone"
                      : "Dictate with Handy"
                  : remote
                    ? "Speech input isn't supported in this browser"
                    : "Open Handy to dictate"
              }
              className={cn(
                "flex size-7 max-md:size-11 shrink-0 items-center justify-center transition-colors disabled:opacity-40",
                micActive ? "animate-pulse text-accent-cyan" : "text-muted-foreground hover:text-accent-cyan",
              )}
            >
              {remote ? <Mic className="size-4" /> : <AudioLines className="size-4" />}
            </button>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={onPaste}
              placeholder={micActive ? "Listening… speak, then press the mic again" : `Ask ${brand} to do something…`}
              aria-label={`Request for ${brand}`}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-text-dim"
            />
            {busy ? (
              <button
                type="button"
                onClick={stopAll}
                aria-label="Stop"
                className="flex size-7 max-md:size-11 items-center justify-center text-status-warning transition-colors hover:bg-surface-3"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label={`Send to ${brand}`}
                className="flex size-7 max-md:size-11 items-center justify-center text-accent-cyan transition-colors hover:bg-surface-3 disabled:text-text-dim disabled:hover:bg-transparent"
              >
                <SendHorizontal className="size-4" />
              </button>
            )}
          </form>

          <QuickDock onBrief={() => speak(briefing())} briefDisabled={busy} />

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <StatusChip
              label="Voice"
              value={voiceStatus ? speechLabel[voiceStatus.speech] : "…"}
              ok={Boolean(voiceStatus) && voiceStatus?.speech !== "browser"}
            />
            {!remote && <StatusChip label="Handy" value={handyChip.value} ok={handyChip.ok} />}
            <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-dim max-md:min-h-11">
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(e) => {
                  setAutoSend(e.target.checked);
                  void update({ "voice.autoSendDictation": e.target.checked }).catch(() => {});
                }}
                className="size-3 accent-[var(--jarvis-cyan)]"
              />
              Send dictation automatically
            </label>
          </div>
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

        <HudNowPlaying />

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
