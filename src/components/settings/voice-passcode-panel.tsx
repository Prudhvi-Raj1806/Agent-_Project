"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mic, ShieldCheck, ShieldOff } from "lucide-react";
import { ConfirmDialog } from "@/components/primitives/confirm-dialog";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import { useConfirm } from "@/lib/use-confirm";

type PasscodeSource = "settings" | "env" | "none";

export function VoicePasscodePanel({ source }: { source: PasscodeSource }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [value, setValue] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    if (value.trim().length < 3) {
      setError("Use at least 3 characters.");
      return;
    }
    if (value !== confirmValue) {
      setError("Both fields must match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: value }),
      });
      if (!res.ok) {
        setError("Couldn't save that passcode.");
        return;
      }
      setValue("");
      setConfirmValue("");
      setEditing(false);
      router.refresh();
    } catch {
      setError("Couldn't reach JARVIS.");
    } finally {
      setPending(false);
    }
  }

  const { confirm, dialogProps } = useConfirm();

  async function remove() {
    await fetch("/api/voice/passcode", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {source !== "none" ? (
            <ShieldCheck className="size-4 text-status-success" />
          ) : (
            <ShieldOff className="size-4 text-text-dim" />
          )}
          <div>
            <p className="text-sm text-foreground">
              {source === "settings" && "A voice passcode is set."}
              {source === "env" && "Using the passcode from .env.local."}
              {source === "none" && "No voice passcode set."}
            </p>
            <p className="text-xs text-muted-foreground">
              {source === "none"
                ? "Risky Quick Actions (like Control Computer) are unavailable until one is set."
                : "Say this phrase aloud to authorize risky Quick Actions."}
            </p>
          </div>
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              {source === "settings" ? "Change" : "Set passcode"}
            </button>
            {source === "settings" && (
              <button
                type="button"
                onClick={() =>
                  confirm({
                    title: "Remove your voice passcode?",
                    description: "Risky Quick Actions (like Control Computer) will become unavailable until you set a new one.",
                    confirmLabel: "Remove",
                    onConfirm: remove,
                  })
                }
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-status-error/50 hover:text-status-error"
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-3">
          <div className="flex items-center gap-2">
            <Mic className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              type={reveal ? "text" : "password"}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="New passcode phrase…"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-cyan/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? "Hide passcode" : "Show passcode"}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
          <input
            type={reveal ? "text" : "password"}
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Confirm passcode…"
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-cyan/40 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-accent-cyan px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setValue("");
                setConfirmValue("");
                setError(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-[11px] text-status-error">{error}</p>}
        </div>
      )}

      {source === "env" && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2">
          <StatusIndicator tone="idle" />
          <p className="text-[11px] text-muted-foreground">
            Set via JARVIS_VOICE_PASSCODE in .env.local. Set one here instead to manage it without editing that file.
          </p>
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
