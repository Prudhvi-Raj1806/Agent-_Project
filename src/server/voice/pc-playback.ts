import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { currentVoicePrefs } from "./prefs";
import { synthesizeSpeechDetailed, type SpeechProviderName, type SynthesizedSpeech } from "./tts";

/**
 * Speaks a line through this PC's own speakers, for when the owner asks from
 * the phone but wants the reply in the room (`voice.replyDevice: "pc"`). The
 * server plays it itself, so no dashboard tab has to be open on the PC.
 *
 * Audio from the usual provider chain is played with Windows' media player;
 * when no provider can speak, Windows' built-in voice reads the text instead.
 * Both run as fixed PowerShell scripts. Text and file paths reach them only
 * through environment variables, never through the command line.
 */

export type PcSpeechResult =
  | { ok: true; provider: SpeechProviderName | "system" }
  | { ok: false; reason: "unsupported" | "stopped" | "failed" };

export interface PcPlaybackDeps {
  platform: NodeJS.Platform;
  synthesize: (text: string) => Promise<SynthesizedSpeech | null>;
  saveTemp: (audio: Buffer, extension: string) => Promise<string>;
  removeTemp: (file: string) => Promise<void>;
  /** Runs one fixed script; resolves with its exit code (non-zero on any failure). */
  runScript: (script: string, env: Record<string, string>, signal: AbortSignal) => Promise<number>;
}

export const MAX_SPOKEN_CHARS = 2_000;
const PLAYBACK_TIMEOUT_MS = 180_000;

export const PLAY_AUDIO_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName PresentationCore",
  "$p = New-Object System.Windows.Media.MediaPlayer",
  "$p.Open([Uri]$env:VEDA_AUDIO_FILE)",
  "$p.Play()",
  "$deadline = (Get-Date).AddSeconds(10)",
  "while (-not $p.NaturalDuration.HasTimeSpan -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 50 }",
  "if (-not $p.NaturalDuration.HasTimeSpan) { $p.Close(); exit 2 }",
  "Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 200)",
  "$p.Close()",
].join("; ");

export const SPEAK_TEXT_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Speech",
  "$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:VEDA_SPEECH_TEXT))",
  "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
  "$s.Speak($text)",
  "$s.Dispose()",
].join("; ");

function extensionFor(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes("wav")) return ".wav";
  if (type.includes("ogg") || type.includes("opus")) return ".ogg";
  if (type.includes("aac")) return ".aac";
  if (type.includes("flac")) return ".flac";
  return ".mp3";
}

function runPowerShell(script: string, env: Record<string, string>, signal: AbortSignal): Promise<number> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(1);
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      env: { ...process.env, ...env },
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(() => child.kill(), PLAYBACK_TIMEOUT_MS);
    const onAbort = () => child.kill();
    signal.addEventListener("abort", onAbort, { once: true });
    const done = (code: number) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(code);
    };
    child.once("error", () => done(1));
    child.once("exit", (code) => done(code ?? 1));
  });
}

export const defaultPcPlaybackDeps: PcPlaybackDeps = {
  platform: process.platform,
  synthesize: (text) => synthesizeSpeechDetailed(text, currentVoicePrefs()),
  async saveTemp(audio, extension) {
    const file = path.join(os.tmpdir(), `veda-speech-${randomUUID()}${extension}`);
    await writeFile(file, audio);
    return file;
  },
  removeTemp: (file) => rm(file, { force: true }),
  runScript: runPowerShell,
};

/** The scripts above are Windows-only. */
export function pcPlaybackSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32";
}

let current: AbortController | null = null;

/** Cuts off whatever the PC is saying right now. Returns whether anything was playing. */
export function stopPcSpeech(): boolean {
  if (!current) return false;
  current.abort();
  current = null;
  return true;
}

/** Speaks one line on the PC and resolves when it has finished. A newer line replaces an older one. */
export async function speakOnPc(text: string, deps: PcPlaybackDeps = defaultPcPlaybackDeps): Promise<PcSpeechResult> {
  if (!pcPlaybackSupported(deps.platform)) return { ok: false, reason: "unsupported" };
  const line = text.trim().slice(0, MAX_SPOKEN_CHARS);
  if (!line) return { ok: false, reason: "failed" };

  stopPcSpeech();
  const controller = new AbortController();
  current = controller;
  const { signal } = controller;

  try {
    const speech = await deps.synthesize(line).catch(() => null);
    if (signal.aborted) return { ok: false, reason: "stopped" };

    if (speech) {
      let file: string | null = null;
      try {
        file = await deps.saveTemp(speech.audio, extensionFor(speech.contentType));
        const code = await deps.runScript(PLAY_AUDIO_SCRIPT, { VEDA_AUDIO_FILE: file }, signal);
        if (signal.aborted) return { ok: false, reason: "stopped" };
        if (code === 0) return { ok: true, provider: speech.provider };
      } catch {
        // Couldn't save or play the audio; the built-in voice below still can.
      } finally {
        if (file) await deps.removeTemp(file).catch(() => {});
      }
    }

    const encoded = Buffer.from(line, "utf8").toString("base64");
    const code = await deps.runScript(SPEAK_TEXT_SCRIPT, { VEDA_SPEECH_TEXT: encoded }, signal);
    if (signal.aborted) return { ok: false, reason: "stopped" };
    return code === 0 ? { ok: true, provider: "system" } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: signal.aborted ? "stopped" : "failed" };
  } finally {
    if (current === controller) current = null;
  }
}
