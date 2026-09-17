"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/primitives/confirm-dialog";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import { useConfirm } from "@/lib/use-confirm";

export function SpotifyConnectionRow({ configured, connected }: { configured: boolean; connected: boolean }) {
  const router = useRouter();
  const { confirm, dialogProps } = useConfirm();

  async function disconnect() {
    await fetch("/api/spotify/disconnect", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2">
        <StatusIndicator
          tone={connected ? "success" : configured ? "idle" : "error"}
          label={connected ? "Connected" : configured ? "Not connected" : "Not configured"}
        />
        <span className="text-sm text-foreground">Spotify</span>
      </div>
      {connected ? (
        <button
          type="button"
          onClick={() =>
            confirm({
              title: "Disconnect Spotify?",
              description: "JARVIS will lose playback control until you reconnect your account.",
              confirmLabel: "Disconnect",
              onConfirm: disconnect,
            })
          }
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-status-error/50 hover:text-status-error"
        >
          Disconnect
        </button>
      ) : configured ? (
        <a
          href="/api/spotify/login"
          className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2"
        >
          Connect
        </a>
      ) : (
        <span className="text-xs text-text-dim">Add SPOTIFY_CLIENT_ID/SECRET to .env.local</span>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
