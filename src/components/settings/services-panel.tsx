"use client";

import { Loader2, Play, RefreshCw, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import { cn } from "@/lib/utils";

interface ServiceStatus {
  id: string;
  label: string;
  running: boolean;
  detail: string | null;
  canControl: boolean;
}

type Action = "start" | "stop" | "restart";
type Notice = { tone: "ok" | "error"; text: string } | null;

const REFRESH_MS = 10_000;
const button =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50";

/** Status and start/stop/restart for the services the dashboard depends on. Commands come from a fixed list on the server. */
export function ServicesPanel() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/services");
      if (!res.ok) throw new Error("Couldn't load services.");
      setServices((await res.json()) as ServiceStatus[]);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load services.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const interval = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [load]);

  const act = async (service: ServiceStatus, action: Action) => {
    setBusy(`${service.id}:${action}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/services/${service.id}/${action}`, { method: "POST" });
      const body = (await res.json()) as ServiceStatus & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't do that.");
      const wantRunning = action !== "stop";
      setNotice(
        body.running === wantRunning
          ? { tone: "ok", text: `${service.label}: ${action === "stop" ? "stopped" : action === "start" ? "started" : "restarted"}.` }
          : { tone: "error", text: `${service.label} didn't ${action === "stop" ? "stop" : "come up"} in time. Check again shortly.` },
      );
      await load();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't do that." });
    } finally {
      setBusy(null);
    }
  };

  if (!services) return <p className="text-sm text-muted-foreground">{loadError ?? "Loading…"}</p>;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border">
        {services.map((service) => {
          const working = busy?.startsWith(`${service.id}:`) ?? false;
          return (
            <li key={service.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <StatusIndicator tone={service.running ? "success" : "idle"} label={service.running ? "Running" : "Stopped"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{service.label}</p>
                {service.detail && <p className="truncate font-mono text-xs text-muted-foreground">{service.detail}</p>}
              </div>
              <div className="flex items-center gap-2">
                {working && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                {service.running ? (
                  <>
                    <button type="button" className={button} disabled={busy !== null || !service.canControl} onClick={() => act(service, "restart")}>
                      <RefreshCw className="size-3.5" />
                      Restart
                    </button>
                    <button type="button" className={button} disabled={busy !== null || !service.canControl} onClick={() => act(service, "stop")}>
                      <Square className="size-3.5" />
                      Stop
                    </button>
                  </>
                ) : (
                  <button type="button" className={button} disabled={busy !== null || !service.canControl} onClick={() => act(service, "start")}>
                    <Play className="size-3.5" />
                    Start
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {notice && <p className={cn("text-xs", notice.tone === "ok" ? "text-status-success" : "text-status-warning")}>{notice.text}</p>}
      {loadError && <p className="text-xs text-status-warning">{loadError}</p>}
    </div>
  );
}
