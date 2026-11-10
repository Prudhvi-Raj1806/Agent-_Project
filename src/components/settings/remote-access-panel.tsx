"use client";

import { Loader2, ShieldAlert, X } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import { cn } from "@/lib/utils";

interface RemoteState {
  enabled: boolean;
  allowedLogins: string[];
  tailnetHost: string;
  url: string | null;
  tailscale: { installed: boolean; running: boolean; loginName: string | null; dnsName: string | null };
  exposure: { exposed: boolean; address: string | null };
  recent: { at: string; login: string; request: string }[];
}

type Notice = { tone: "ok" | "error"; text: string } | null;

const button =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50";
const field =
  "min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-cyan/60 disabled:opacity-50";

/** Phone access over Tailscale: on/off, set-up, who may connect, and what has been changed remotely. */
export function RemoteAccessPanel() {
  const [state, setState] = useState<RemoteState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [newLogin, setNewLogin] = useState("");
  const [qr, setQr] = useState<{ url: string; dataUrl: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/remote-access");
      if (!res.ok) throw new Error("Couldn't load phone access settings.");
      setState((await res.json()) as RemoteState);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load phone access settings.");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const url = state?.url ?? null;
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 176 })
      .then((dataUrl) => {
        if (!cancelled) setQr({ url, dataUrl });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);

  const save = async (patch: { enabled?: boolean; allowedLogins?: string[] }) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/remote-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as RemoteState & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that.");
      setState(body);
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't save that." });
    } finally {
      setBusy(false);
    }
  };

  const serve = async (action: "enable" | "disable") => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/remote-access/serve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json()) as { ok?: boolean; output?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't do that.");
      if (body.ok) {
        setNotice({ tone: "ok", text: action === "enable" ? "Phone access is set up." : "Phone access is turned off." });
      } else {
        const text = body.output || "Tailscale couldn't do that.";
        const needsHttps = /https|certificate/i.test(text);
        setNotice({
          tone: "error",
          text: needsHttps ? `${text} — turn on HTTPS certificates once in the Tailscale admin console (DNS page).` : text,
        });
      }
      await load();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't do that." });
    } finally {
      setBusy(false);
    }
  };

  const addLogin = () => {
    const login = newLogin.trim();
    if (!login || !state) return;
    setNewLogin("");
    void save({ allowedLogins: [...state.allowedLogins, login] });
  };

  if (!state) return <p className="text-sm text-muted-foreground">{loadError ?? "Loading…"}</p>;

  const { tailscale } = state;
  const qrForUrl = qr && qr.url === url ? qr.dataUrl : null;

  return (
    <div className="flex flex-col gap-4">
      {state.exposure.exposed && (
        <div className="flex items-start gap-2 rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-status-warning" />
          <p>
            This server is reachable on your network at <span className="font-mono">{state.exposure.address}</span>, not only on this PC. Restart it with{" "}
            <span className="font-mono">npm run dev</span> or <span className="font-mono">npm start</span> from a normal terminal; both bind to 127.0.0.1.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">Allow the phone to connect</p>
          <p className="text-xs text-muted-foreground">Off by default. When off, nothing from outside this PC gets in.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.enabled}
          aria-label="Allow phone access"
          disabled={busy}
          onClick={() => void save({ enabled: !state.enabled })}
          className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50", state.enabled ? "bg-accent-cyan" : "bg-surface-2")}
        >
          <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-background transition-transform", state.enabled && "translate-x-4")} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <StatusIndicator
          tone={!tailscale.installed ? "error" : tailscale.running ? "success" : "idle"}
          label={!tailscale.installed ? "Not installed" : tailscale.running ? "Tailscale connected" : "Tailscale not running"}
        />
        {tailscale.loginName && <span className="font-mono text-xs text-muted-foreground">{tailscale.loginName}</span>}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {url ? (
            <a href={url} className="truncate font-mono text-sm text-accent-cyan hover:underline" target="_blank" rel="noreferrer">
              {url}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">Not set up yet. Press Enable phone access.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={button} disabled={busy || !tailscale.running} onClick={() => void serve("enable")}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Enable phone access
            </button>
            <button type="button" className={button} disabled={busy || !tailscale.installed} onClick={() => void serve("disable")}>
              Disable
            </button>
          </div>
        </div>
        {qrForUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrForUrl} alt="QR code for the phone address" width={88} height={88} className="size-22 shrink-0 rounded-md bg-white p-1" />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-text-dim">Allowed Tailscale logins</p>
        <div className="flex flex-wrap gap-2">
          {state.allowedLogins.length === 0 && <span className="text-xs text-muted-foreground">None yet. Enabling phone access adds yours.</span>}
          {state.allowedLogins.map((login) => (
            <span key={login} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 py-1 pr-1.5 pl-3 text-xs text-foreground">
              {login}
              <button
                type="button"
                aria-label={`Remove ${login}`}
                disabled={busy}
                onClick={() => void save({ allowedLogins: state.allowedLogins.filter((l) => l !== login) })}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className={field}
            value={newLogin}
            onChange={(e) => setNewLogin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLogin()}
            placeholder="name@example.com"
            aria-label="Add an allowed Tailscale login"
            disabled={busy}
          />
          <button type="button" className={button} disabled={busy || !newLogin.trim()} onClick={addLogin}>
            Add
          </button>
        </div>
      </div>

      {notice && <p className={cn("text-xs", notice.tone === "ok" ? "text-status-success" : "text-status-warning")}>{notice.text}</p>}

      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-text-dim">Recent changes from the phone</p>
        {state.recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {state.recent.map((row, i) => (
              <li key={`${row.at}-${i}`} className="flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
                <span className="tabular-nums">{new Date(row.at).toLocaleString()}</span>
                <span className="text-foreground">{row.request}</span>
                <span>{row.login}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
