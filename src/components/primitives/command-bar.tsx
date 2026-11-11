"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Mic, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { askBrain } from "@/lib/jarvis/brain-run";
import { useBrand } from "@/lib/settings/use-brand";

/** How long a mini brain reply stays under the bar. */
const REPLY_SHOWN_MS = 8_000;

interface CommandBarProps {
  placeholder?: string;
  className?: string;
}

export function CommandBar({
  placeholder,
  className,
}: CommandBarProps) {
  const brand = useBrand();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function focusInput() {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusInput();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    }
    // Dispatched by the "Start Research" quick action — same effect as Ctrl/Cmd+K.
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("jarvis:focus-command-bar", focusInput);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("jarvis:focus-command-bar", focusInput);
    };
  }, []);

  /** Shows a mini brain reply under the bar, then clears it. Typed requests are not spoken. */
  function showReply(text: string | null) {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    setReply(text);
    replyTimer.current = text === null ? null : setTimeout(() => setReply(null), REPLY_SHOWN_MS);
  }

  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    },
    [],
  );

  async function submit() {
    const objective = value.trim();
    if (!objective || status === "submitting") return;

    setStatus("submitting");
    setError(null);
    showReply(null);
    try {
      // The mini brain hears it first: it answers here, or hands it to Hermes as a mission.
      const answer = await askBrain(objective, []);
      setValue("");
      setStatus("idle");
      if (answer.kind !== "handoff") {
        showReply(answer.text);
        return;
      }
      if (pathname === "/work") {
        router.refresh();
      } else {
        router.push("/work");
      }
    } catch (err) {
      // A refused request carries the server's reason; a network failure has none worth showing.
      setError(err instanceof TypeError ? `Couldn't reach ${brand}.` : err instanceof Error ? err.message : `Couldn't reach ${brand}.`);
      setStatus("error");
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "group flex h-10 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 transition-colors focus-within:border-accent-cyan/40",
          status === "error" && "border-status-error/40"
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={placeholder ?? `Ask ${brand} anything...`}
          disabled={status === "submitting"}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
        />
        {status === "submitting" ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <kbd className="hidden shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
            Ctrl K
          </kbd>
        )}
        <button
          type="button"
          aria-label="Ask with voice"
          className="flex size-6 max-md:size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
        >
          <Mic className="size-4" />
        </button>
      </div>
      {error && (
        <p className="absolute top-full left-1 z-20 mt-1 text-[11px] text-status-error">{error}</p>
      )}
      {reply && !error && (
        <p
          role="status"
          className="absolute top-full right-0 left-0 z-20 mt-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs leading-snug text-foreground shadow-[0_8px_24px_-12px_rgba(0,0,0,0.7)]"
        >
          {reply}
        </p>
      )}
    </div>
  );
}
