"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { speakInBrowser } from "@/lib/jarvis/browser-voice";
import { voiceTestLine } from "@/lib/jarvis/voice-test-line";
import { useAppSettings } from "@/lib/settings/app-settings-context";
import type { SettingsShape } from "@/server/settings/schema";

interface Voice {
  id: string;
  name: string;
}
interface VoiceList {
  available: boolean;
  voices: Voice[];
  kokoro: { available: boolean; voices: string[]; custom: string[] };
}

const NO_VOICES: VoiceList = { available: false, voices: [], kokoro: { available: false, voices: [], custom: [] } };

const LANGUAGES: Record<string, string> = {
  a: "US English",
  b: "UK English",
  e: "Spanish",
  f: "French",
  h: "Hindi",
  i: "Italian",
  j: "Japanese",
  p: "Portuguese",
  z: "Mandarin",
};

/** af_heart becomes "Heart · US English, female"; a custom voice becomes "Friday · custom voice". */
function kokoroLabel(id: string, custom: string[] = []): string {
  if (custom.includes(id)) return `${id.charAt(0).toUpperCase()}${id.slice(1)} · custom voice`;
  const [code, name = id] = id.split("_");
  const language = LANGUAGES[code?.[0] ?? ""] ?? "Other";
  const gender = code?.[1] === "m" ? "male" : "female";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} · ${language}, ${gender}`;
}

const PROVIDERS: { value: SettingsShape["voice.provider"]; label: string }[] = [
  { value: "auto", label: "Automatic: Kokoro, then Voice Studio, then ElevenLabs, then browser" },
  { value: "kokoro", label: "Kokoro only (local, light)" },
  { value: "voicestudio", label: "Voice Studio only" },
  { value: "elevenlabs", label: "ElevenLabs only" },
  { value: "browser", label: "Browser voice only" },
];

const REPLY_DEVICES: { value: SettingsShape["voice.replyDevice"]; label: string }[] = [
  { value: "this-device", label: "The device that asked" },
  { value: "pc", label: "This PC's speakers" },
];

const PROVIDER_NAME: Record<string, string> = {
  kokoro: "Kokoro",
  voicestudio: "Voice Studio",
  elevenlabs: "ElevenLabs",
  browser: "Browser voice",
};

const field =
  "rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground disabled:opacity-50";
const button =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50";

/** How the owner's voice is chosen: which engine speaks, which voice, where replies play, and dictation behaviour. */
export function VoicePanel() {
  const { settings, update } = useAppSettings();
  const [voices, setVoices] = useState<VoiceList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [preset, setPreset] = useState("");

  const loadVoices = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/voices");
      setVoices(res.ok ? ((await res.json()) as VoiceList) : NO_VOICES);
    } catch {
      setVoices(NO_VOICES);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void loadVoices(), 0);
    return () => clearTimeout(first);
  }, [loadVoices]);

  const save = async (patch: Partial<SettingsShape>): Promise<boolean> => {
    setError(null);
    try {
      await update(patch);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
      return false;
    }
  };

  const testVoice = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    const line = voiceTestLine(settings["persona.name"]);
    const started = performance.now();
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line }),
      });
      const ms = Math.round(performance.now() - started);
      if (!res.ok) {
        speakInBrowser(line);
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
  const kokoroOptions = voices?.kokoro.voices ?? [];
  const kokoroCustom = voices?.kokoro.custom ?? [];
  const currentKokoro = settings["voice.kokoroVoice"];

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
        <label htmlFor="kokoro-voice" className="text-sm text-foreground">
          Kokoro voice
        </label>
        <select
          id="kokoro-voice"
          className={field}
          value={currentKokoro}
          disabled={!voices?.kokoro.available}
          onChange={(e) => save({ "voice.kokoroVoice": e.target.value })}
        >
          {!kokoroOptions.includes(currentKokoro) && (
            <option value={currentKokoro}>{kokoroLabel(currentKokoro, kokoroCustom)}</option>
          )}
          {kokoroOptions.map((id) => (
            <option key={id} value={id}>
              {kokoroLabel(id, kokoroCustom)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {voices === null
            ? "Looking for Kokoro…"
            : voices.kokoro.available
              ? "Kokoro runs on this PC: free, private, no internet needed."
              : "Kokoro isn't running. Start it from Services above; the current voice stays selected."}
        </p>
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
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Built-in voice name"
            placeholder="Or type a built-in voice, e.g. alba"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className={`${field} min-w-0 flex-1`}
          />
          <button
            type="button"
            className={button}
            disabled={!preset.trim()}
            onClick={async () => {
              if (await save({ "voice.voicestudioVoice": preset.trim() })) setPreset("");
            }}
          >
            Use
          </button>
        </div>
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
