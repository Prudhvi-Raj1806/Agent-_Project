"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { followEnvelope, rmsFromTimeDomain, syntheticSpeechLevel } from "./envelope";

export type JarvisVoiceState = "idle" | "thinking" | "speaking";

export interface JarvisVoice {
  state: JarvisVoiceState;
  /** The line currently being spoken (or last spoken), for captions. */
  caption: string;
  /**
   * Smoothed 0..1 speech energy, updated every animation frame. A ref, not
   * state — the globe reads it inside its own draw loop, so speech never
   * triggers a React re-render per frame.
   */
  levelRef: React.RefObject<number>;
  speak: (text: string) => void;
  stop: () => void;
  /** Shows the globe's "Processing" state while work (e.g. a mission) runs with no audio. */
  setThinking: (on: boolean) => void;
}

/**
 * Speaks a line the way the rest of the app does (ElevenLabs via
 * `/api/voice/speak`, else the browser's built-in voice) and exposes a live
 * loudness signal for the globe.
 *
 * - ElevenLabs path: real audio is routed through a Web Audio analyser, so
 *   the level is the actual loudness of what's being said.
 * - Built-in voice path: SpeechSynthesis gives us no audio to tap, so the
 *   level is a speech-shaped synthetic envelope (see `syntheticSpeechLevel`),
 *   nudged by word-boundary events. It's labelled as such in the UI code,
 *   never presented as measured audio.
 */
export function useJarvisVoice(): JarvisVoice {
  const [state, setState] = useState<JarvisVoiceState>("idle");
  const [caption, setCaption] = useState("");
  const levelRef = useRef(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef<"none" | "analyser" | "synthetic">("none");
  const startedAtRef = useRef(0);
  const boostRef = useRef(0);
  const requestIdRef = useRef(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    let last = performance.now();
    const buffer = new Uint8Array(512);
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      let target = 0;
      if (modeRef.current === "analyser" && analyserRef.current) {
        analyserRef.current.getByteTimeDomainData(buffer);
        target = rmsFromTimeDomain(buffer);
      } else if (modeRef.current === "synthetic") {
        const t = (now - startedAtRef.current) / 1000;
        boostRef.current = Math.max(0, boostRef.current - dt * 2.5);
        target = Math.min(1, syntheticSpeechLevel(t, 11) * 0.8 + boostRef.current * 0.3);
      }
      levelRef.current = followEnvelope(levelRef.current, target, dt);

      // Keep ticking while speaking or while the globe is still settling.
      if (modeRef.current !== "none" || levelRef.current > 0.005) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        levelRef.current = 0;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop]);

  const releaseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    audioRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    analyserRef.current = null;
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    modeRef.current = "none";
  }, []);

  const finish = useCallback(
    (requestId: number) => {
      if (requestId !== requestIdRef.current) return;
      modeRef.current = "none";
      setState("idle");
    },
    [],
  );

  const speakBuiltIn = useCallback(
    (text: string, requestId: number) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        finish(requestId);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => {
        if (requestId !== requestIdRef.current) return;
        startedAtRef.current = performance.now();
        modeRef.current = "synthetic";
        setState("speaking");
        startLoop();
      };
      utterance.onboundary = () => {
        boostRef.current = 1;
      };
      utterance.onend = () => finish(requestId);
      utterance.onerror = () => finish(requestId);
      window.speechSynthesis.speak(utterance);
    },
    [finish, startLoop],
  );

  const speak = useCallback(
    (text: string) => {
      const line = text.trim();
      if (!line) return;
      const requestId = ++requestIdRef.current;
      releaseAudio();
      setCaption(line);
      setState("thinking");

      fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("ElevenLabs not configured");
          const blob = await res.blob();
          if (requestId !== requestIdRef.current) return;

          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;

          const AudioCtor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioCtor) {
            const ctx = new AudioCtor();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            ctx.createMediaElementSource(audio).connect(analyser);
            analyser.connect(ctx.destination);
            ctxRef.current = ctx;
            analyserRef.current = analyser;
            modeRef.current = "analyser";
          } else {
            startedAtRef.current = performance.now();
            modeRef.current = "synthetic";
          }

          audio.onended = () => finish(requestId);
          audio.onerror = () => finish(requestId);
          await audio.play();
          if (requestId !== requestIdRef.current) return;
          setState("speaking");
          startLoop();
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          releaseAudio();
          speakBuiltIn(line, requestId);
        });
    },
    [finish, releaseAudio, speakBuiltIn, startLoop],
  );

  const stop = useCallback(() => {
    requestIdRef.current++;
    releaseAudio();
    setState("idle");
  }, [releaseAudio]);

  const setThinking = useCallback((on: boolean) => {
    setState((prev) => (on ? (prev === "speaking" ? prev : "thinking") : prev === "thinking" ? "idle" : prev));
  }, []);

  useEffect(
    () => () => {
      requestIdRef.current++;
      stopLoop();
      releaseAudio();
    },
    [releaseAudio, stopLoop],
  );

  return { state, caption, levelRef, speak, stop, setThinking };
}
