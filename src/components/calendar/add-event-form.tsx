"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AddEventForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 60 * 60_000)));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const startsAt = new Date(when);
    if (Number.isNaN(startsAt.getTime())) {
      setError("Pick a valid date and time.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, startsAt: startsAt.toISOString() }),
      });
      if (!res.ok) {
        setError("Couldn't add that event.");
        return;
      }
      setTitle("");
      setWhen(toDatetimeLocalValue(new Date(Date.now() + 60 * 60_000)));
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't reach JARVIS.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 self-start rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2"
      >
        <Plus className="size-3.5" />
        Add event
      </button>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-md border border-border bg-surface-1 p-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Event title…"
          className="w-44 min-w-0 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-cyan/40 focus:outline-none"
        />
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground focus:border-accent-cyan/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="shrink-0 rounded-md bg-accent-cyan px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {error && <p className="text-[11px] text-status-error">{error}</p>}
    </div>
  );
}
