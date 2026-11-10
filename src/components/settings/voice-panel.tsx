"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { useAppSettings } from "@/lib/settings/app-settings-context";
import type { SettingsShape } from "@/server/settings/schema";

interface Voice {
  id: string;
  name: string;
}
interface VoiceList {
  available: boolean;
  voices: Voice[];
}

const PROVIDERS: { value: SettingsShape["voice.provider"]; label: string }[] = [
  { value: "auto", label: "Automatic: Voice Studio, then ElevenLabs, then browser" },
  { value: "voicestudio", label: "Voice Studio only" },
  { value: "elevenlabs", label: "ElevenLabs only" },
  { value: "browser", label: "Browser voice only" },
];

const REPLY_DEVICES: { value: SettingsShape["voice.replyDevice"]; label: string }[] = [
  { value: "this-device", label: "The device that asked" },
  { value: "pc", label: "This PC's speakers" },
];

const PROVIDER_NAME: Record<string, string> = {
  voicestudio: "Voice Studio",
  elevenlabs: "ElevenLabs",
  browser: "Browser voice",
};

const TEST_LINE = "Veda here. Voice check.";

const field =
  "rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground disabled:opacity-50";
const button =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50";

function speakInBrowser(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}

/** How the owner's voice is chosen: which engine speaks, which voice, where replies play, and dictation behaviour. */
export function VoicePanel() {
  const { settings, update } = useAppSettings();
  const [voices, setVoices] = useState<VoiceList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const loadVoices = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/voices");
      setVoices(res.ok ? ((await res.json()) as VoiceList) : { available: false, voices: [] });
    } catch {
      setVoices({ available: false, voices: [] });
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void loadVoices(), 0);
    return () => clearTimeout(first);
  }, [loadVoices]);

  const save = async (patch: Partial<SettingsShape>) => {
    setError(null);
    try {
      await update(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    }
  };

  const testVoice = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    const started = performance.now();
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: TEST_LINE }),
      });
      const ms = Math.round(performance.now() - started);
      if (!res.ok) {
        speakInBrowser(TEST_LINE);
        setTestResult(`Browser voice (no server voice answered) · ${ms} ms`);
        return;
      }
      const who = PROVIDER_NAME[res.headers.get("X-Voice-Provider") ?? ""] ?? "Unknown";
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      await audio.play();
      setTestResult(`${who} · answered in ${ms} ms, playing on this device`);
    } catch {
      setError("Couldn't play a test line here.");
    } finally {
      setTesting(false);
    }
  };

  const voiceOptions: Voice[] = voices?.voices ?? [];
  const currentVoice = settings["voice.voicestudioVoice"];
  const currentListed = voiceOptions.some((v) => v.id === currentVoice);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="voice-provider" className="text-sm text-foreground">
          Speech engine
        </label>
        <select
          id="voice-provider"
          className={field}
          value={settings["voice.provider"]}
          onChange={(e) => save({ "voice.provider": e.target.value as SettingsShape["voice.provider"] })}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="voice-studio-voice" className="text-sm text-foreground">
            Voice Studio voice
          </label>
          <button type="button" className={button} onClick={() => void loadVoices()}>
            Refresh
          </button>
        </div>
        <select
          id="voice-studio-voice"
          className={field}
          value={currentVoice}
          disabled={!voices?.available}
          onChange={(e) => save({ "voice.voicestudioVoice": e.target.value })}
        >
          {!currentListed && <option value={currentVoice}>{currentVoice}</option>}
          {voiceOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {voices === null
            ? "Looking for Voice Studio…"
            : voices.available
              ? "Voices come from your Voice Studio profiles."
              : "Voice Studio isn't running. Open it to choose a voice; the current one stays in use."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reply-device" className="text-sm text-foreground">
          Where replies play
        </label>
        <select
          id="reply-device"
          className={field}
          value={settings["voice.replyDevice"]}
          onChange={(e) => save({ "voice.replyDevice": e.target.value as SettingsShape["voice.replyDevice"] })}
        >
          {REPLY_DEVICES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          From the phone, &ldquo;This PC&rsquo;s speakers&rdquo; plays the reply in the room.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={settings["voice.autoSendDictation"]}
          onChange={(e) => save({ "voice.autoSendDictation": e.target.checked })}
          className="size-3.5 accent-[var(--jarvis-cyan)]"
        />
        Send dictation automatically
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={button} onClick={() => void testVoice()} disabled={testing}>
          {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
          Test voice
        </button>
        {testResult && <span className="text-xs text-muted-foreground">{testResult}</span>}
      </div>

      {error && <p className="text-xs text-status-warning">{error}</p>}
    </div>
  );
}
