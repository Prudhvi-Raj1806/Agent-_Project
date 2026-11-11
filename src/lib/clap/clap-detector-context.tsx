"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { speakInBrowser } from "@/lib/jarvis/browser-voice";
import { useOwnerName } from "@/lib/settings/use-brand";
import { useSpotifyPlayer } from "@/lib/spotify/use-spotify-player";
import { useClapDetector, type ClapDetectorStatus } from "./use-clap-detector";

const STORAGE_KEY = "jarvis:clap-wake-enabled";

interface ClapDetectorContextValue {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  status: ClapDetectorStatus;
}

const ClapDetectorContext = createContext<ClapDetectorContextValue>({
  enabled: false,
  setEnabled: () => {},
  status: "idle",
});

export function useClapWake(): ClapDetectorContextValue {
  return useContext(ClapDetectorContext);
}

function speak(text: string) {
  fetch("/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error("ElevenLabs not configured");
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      await audio.play();
    })
    .catch(() => {
      // No server voice could speak — fall back to the browser's own (female) voice.
      speakInBrowser(text);
    });
}

function greetingFor(date: Date, ownerName: string): string {
  const hour = date.getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${ownerName}. Systems online.`;
}

/**
 * Mounted once at the app root (inside SpotifyPlayerProvider, so it can
 * resume playback the same way the Music page does). Listens for a
 * double-clap — entirely client-side, via the Web Audio API — and runs a
 * "welcome routine" inspired by a separate clap-triggered Jarvis script the
 * user pointed at: opens VS Code + the browser, resumes Spotify, and speaks
 * a greeting (ElevenLabs if configured, else the browser's built-in voice).
 * Off by default; the user opts in from Settings.
 */
export function ClapDetectorProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const { play } = useSpotifyPlayer();
  const ownerName = useOwnerName();

  useEffect(() => {
    const timer = setTimeout(() => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        // localStorage unavailable (private mode, blocked) — stay disabled.
      }
      if (stored === "true") setEnabledState(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // best-effort persistence only
    }
  }, []);

  const runWelcomeRoutine = useCallback(() => {
    fetch("/api/actions/welcome-routine/run", { method: "POST" }).catch(() => {});
    void play();
    speak(greetingFor(new Date(), ownerName));
  }, [play, ownerName]);

  const status = useClapDetector(enabled, runWelcomeRoutine);

  return (
    <ClapDetectorContext.Provider value={{ enabled, setEnabled, status }}>{children}</ClapDetectorContext.Provider>
  );
}
