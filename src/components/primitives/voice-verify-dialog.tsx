"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// The Web Speech API has no official TS lib types — this is the minimal shape this component uses.
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike extends Event {
  results: { [index: number]: { [index: number]: SpeechRecognitionResultLike } };
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

type SpeechPhase = "idle" | "listening" | "verifying" | "success" | "error";

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceVerifyDialog({
  open,
  actionLabel,
  onClose,
  onVerified,
}: {
  open: boolean;
  actionLabel: string;
  onClose: () => void;
  onVerified: (token: string) => void;
}) {
  const [phase, setPhase] = useState<SpeechPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [trackedOpen, setTrackedOpen] = useState(open);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = getRecognitionCtor() !== null;

  // Reset during render (not in an effect) when the dialog closes.
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    if (!open) {
      setPhase("idle");
      setMessage(null);
    }
  }

  useEffect(() => {
    if (!open) recognitionRef.current?.stop();
  }, [open]);

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setMessage(null);
    setPhase("listening");

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setPhase("verifying");
      try {
        const res = await fetch("/api/actions/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript }),
        });
        const data = await res.json();
        if (!res.ok || !data.token) {
          setPhase("error");
          setMessage(data.reason ?? "Verification failed.");
          return;
        }
        setPhase("success");
        onVerified(data.token);
      } catch {
        setPhase("error");
        setMessage("Couldn't reach the verification service.");
      }
    };
    recognition.onerror = () => {
      setPhase("error");
      setMessage("Didn't catch that. Try again.");
    };
    recognition.onend = () => {
      setPhase((p) => (p === "listening" ? "idle" : p));
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-status-warning" />
            Verification required
          </DialogTitle>
          <DialogDescription>
            &ldquo;{actionLabel}&rdquo; needs voice verification. Say your passcode.
          </DialogDescription>
        </DialogHeader>

        {!supported ? (
          <p className="text-sm text-muted-foreground">
            Voice input isn&rsquo;t supported in this browser. Try Chrome or Edge.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            <button
              type="button"
              onClick={startListening}
              disabled={phase === "listening" || phase === "verifying"}
              className={cn(
                "flex size-16 items-center justify-center rounded-full border transition-colors",
                phase === "listening"
                  ? "animate-pulse border-accent-cyan bg-accent-cyan/10 text-accent-cyan"
                  : phase === "success"
                    ? "border-status-success bg-status-success/10 text-status-success"
                    : phase === "error"
                      ? "border-status-error bg-status-error/10 text-status-error"
                      : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
              )}
            >
              <Mic className="size-6" />
            </button>
            <p className="text-center text-xs text-muted-foreground">
              {phase === "idle" && "Press the mic and speak your passcode."}
              {phase === "listening" && "Listening…"}
              {phase === "verifying" && "Verifying…"}
              {phase === "success" && "Verified — running the action."}
              {phase === "error" && (message ?? "Verification failed.")}
            </p>
          </div>
        )}

        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
