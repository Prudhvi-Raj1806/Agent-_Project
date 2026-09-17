"use client";

import { useEffect, useRef, useState } from "react";
import { ClapTracker } from "./clap-tracker";

export type ClapDetectorStatus = "idle" | "listening" | "denied" | "unsupported";

/**
 * Web Audio plumbing only — the actual double-clap detection math lives in
 * ClapTracker (pure, unit-tested). Audio is analyzed entirely in the
 * browser via a local RMS computation; no audio data or transcript is ever
 * sent anywhere.
 */
export function useClapDetector(enabled: boolean, onDoubleClap: () => void): ClapDetectorStatus {
  const [status, setStatus] = useState<ClapDetectorStatus>("idle");
  const onDoubleClapRef = useRef(onDoubleClap);

  useEffect(() => {
    onDoubleClapRef.current = onDoubleClap;
  }, [onDoubleClap]);

  useEffect(() => {
    if (!enabled) {
      const timer = setTimeout(() => setStatus("idle"), 0);
      return () => clearTimeout(timer);
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const timer = setTimeout(() => setStatus("unsupported"), 0);
      return () => clearTimeout(timer);
    }

    let stopped = false;
    let audioContext: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    const tracker = new ClapTracker();

    async function start() {
      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!stopped) setStatus("denied");
        return;
      }
      if (stopped) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = mic;
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);

      setStatus("listening");

      function tick() {
        analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i] * buffer[i];
        const rms = Math.sqrt(sumSquares / buffer.length);

        if (tracker.push(rms, performance.now())) {
          onDoubleClapRef.current();
        }
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    }

    const startTimer = setTimeout(start, 0);

    return () => {
      stopped = true;
      clearTimeout(startTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      audioContext?.close();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);

  return status;
}
