"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Mic, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandBarProps {
  placeholder?: string;
  className?: string;
}

export function CommandBar({
  placeholder = "Ask JARVIS anything...",
  className,
}: CommandBarProps) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
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

  async function submit() {
    const objective = value.trim();
    if (!objective || status === "submitting") return;

    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create that mission.");
        setStatus("error");
        return;
      }
      setValue("");
      setStatus("idle");
      if (pathname === "/work") {
        router.refresh();
      } else {
        router.push("/work");
      }
    } catch {
      setError("Couldn't reach JARVIS.");
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
          placeholder={placeholder}
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
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
        >
          <Mic className="size-4" />
        </button>
      </div>
      {error && (
        <p className="absolute top-full left-1 z-20 mt-1 text-[11px] text-status-error">{error}</p>
      )}
    </div>
  );
}
