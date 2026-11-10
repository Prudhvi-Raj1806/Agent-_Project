"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import { cn } from "@/lib/utils";

interface ModelChoice {
  provider: string;
  label: string;
  models: string[];
}

interface HermesConfigResponse {
  status: { mode: "real" | "mock"; url: string | null; healthy: boolean; version?: string; latencyMs?: number };
  current: { provider: string; model: string } | null;
  choices: ModelChoice[];
  configError: string | null;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

const field =
  "w-full rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent-cyan/60 disabled:opacity-50";
const button =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50";

/** Hermes gateway status, which model it runs on, and a safe way to switch that model. Never shows or edits API keys. */
export function HermesPanel() {
  const [data, setData] = useState<HermesConfigResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState<"apply" | "restart" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hermes/config");
      const body = (await res.json()) as HermesConfigResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't load Hermes settings.");
      setData(body);
      setLoadError(null);
      return body;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load Hermes settings.");
      return null;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load().then((body) => {
        if (body?.current) {
          setProvider(body.current.provider);
          setModel(body.current.model);
        }
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const models = data?.choices.find((c) => c.provider === provider)?.models ?? [];
  const changed = Boolean(data?.current && (data.current.provider !== provider || data.current.model !== model));

  const pickProvider = (next: string) => {
    setProvider(next);
    const first = data?.choices.find((c) => c.provider === next)?.models[0] ?? "";
    setModel(first);
  };

  const apply = async () => {
    setBusy("apply");
    setNotice(null);
    try {
      const res = await fetch("/api/hermes/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      const body = (await res.json()) as { error?: string; restartError?: string | null; health?: { healthy: boolean } | null };
      if (!res.ok) throw new Error(body.error ?? "Couldn't apply that.");
      if (body.restartError) setNotice({ tone: "error", text: `Saved, but the restart failed: ${body.restartError}` });
      else if (body.health && !body.health.healthy)
        setNotice({ tone: "error", text: "Saved and restarted, but the gateway isn't answering yet. Check again shortly." });
      else setNotice({ tone: "ok", text: "Applied. Hermes restarted on the new model." });
      await load();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't apply that." });
    } finally {
      setBusy(null);
    }
  };

  const restart = async () => {
    setBusy("restart");
    setNotice(null);
    try {
      const res = await fetch("/api/hermes/restart", { method: "POST" });
      const body = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) throw new Error(body.error ?? "Couldn't restart.");
      setNotice(
        body.ok
          ? { tone: "ok", text: "Gateway restarted." }
          : { tone: "error", text: "Restarted, but the gateway isn't answering yet." },
      );
      await load();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't restart." });
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return <p className="text-sm text-muted-foreground">{loadError ?? "Loading…"}</p>;
  }

  const { status } = data;
  const tone = status.mode === "mock" ? "idle" : status.healthy ? "success" : "error";
  const label = status.mode === "mock" ? "Simulated" : status.healthy ? "Running" : "Not running";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <StatusIndicator tone={tone} label={label} />
        <span className="font-mono text-xs text-muted-foreground">
          {[status.url, status.version && `v${status.version}`, status.latencyMs !== undefined && status.healthy && `${status.latencyMs} ms`]
            .filter(Boolean)
            .join(" · ") || "No gateway configured"}
        </span>
      </div>

      {data.configError ? (
        <p className="text-xs text-status-warning">{data.configError}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-dim">Provider</span>
            <select className={field} value={provider} onChange={(e) => pickProvider(e.target.value)} disabled={busy !== null}>
              {data.choices.map((c) => (
                <option key={c.provider} value={c.provider}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-dim">Model</span>
            <select className={field} value={model} onChange={(e) => setModel(e.target.value)} disabled={busy !== null}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={apply} disabled={busy !== null || !changed || Boolean(data.configError)}>
          {busy === "apply" && <Loader2 className="size-3.5 animate-spin" />}
          Apply &amp; restart
        </button>
        <button type="button" className={button} onClick={restart} disabled={busy !== null}>
          {busy === "restart" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Restart gateway
        </button>
        {notice && (
          <span className={cn("text-xs", notice.tone === "ok" ? "text-status-success" : "text-status-warning")}>{notice.text}</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Only the provider and model change; the file is backed up first and API keys are never shown or edited here.
        Local models run on your CPU and can take minutes per mission.
      </p>
    </div>
  );
}
