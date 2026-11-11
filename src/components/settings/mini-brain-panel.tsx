"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { useAppSettings } from "@/lib/settings/app-settings-context";
import { cn } from "@/lib/utils";

interface BrainStatus {
  enabled: boolean;
  model: string;
  ollamaRunning: boolean;
  modelInstalled: boolean;
  modelLoaded: boolean;
  installed: string[];
  persona: "soul" | "starter";
  lastAnswerMs: number | null;
}

const field =
  "w-full rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground disabled:opacity-50";
const button =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50";

/** "phi4-mini" and "phi4-mini:latest" are the same model. */
const sameModel = (a: string, b: string) => {
  const full = (name: string) => (name.includes(":") ? name : `${name}:latest`);
  return full(a) === full(b);
};

function readiness(status: BrainStatus): { tone: "ok" | "warn"; text: string } {
  if (!status.ollamaRunning) return { tone: "warn", text: "Ollama isn't running. Start it from Services above." };
  if (!status.modelInstalled) return { tone: "warn", text: `${status.model} isn't installed in Ollama.` };
  return status.modelLoaded
    ? { tone: "ok", text: "Ready, model loaded." }
    : { tone: "ok", text: "Ready. The model loads on the first request, which takes a few seconds." };
}

/**
 * The mini brain: the small local model that hears every request first. Its
 * switch, which model it uses, whether that model is ready, and a quick test.
 */
export function MiniBrainPanel() {
  const { settings, update } = useAppSettings();
  const enabled = settings["brain.enabled"];
  const model = settings["brain.model"];

  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/brain");
      if (!res.ok) throw new Error();
      setStatus((await res.json()) as BrainStatus);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  const save = async (patch: Parameters<typeof update>[0]) => {
    setSaving(true);
    setError(null);
    setTestResult(null);
    try {
      await update(patch);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    const started = performance.now();
    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello" }),
      });
      const body = (await res.json().catch(() => ({}))) as { kind?: string; text?: string; notice?: string; error?: string };
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      if (!res.ok) {
        setError(body.error ?? "The mini brain didn't answer.");
      } else if (body.kind === "handoff") {
        setTestResult(`Handed to Hermes instead of answering (${seconds} s). ${body.notice ?? "The mini brain is switched off."}`);
      } else {
        setTestResult(`"${body.text ?? ""}" in ${seconds} s`);
      }
      await load();
    } catch {
      setError("Couldn't reach the dashboard to test the mini brain.");
    } finally {
      setTesting(false);
    }
  };

  const installed = status?.installed ?? [];
  const listed = installed.some((name) => sameModel(name, model));
  const ready = status ? readiness(status) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-foreground">Answer first with the mini brain</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {enabled
              ? "Small talk and local skills are answered on this PC. Everything else is handed to Hermes."
              : "Off: every request goes straight to Hermes."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Answer first with the mini brain"
          disabled={saving}
          onClick={() => void save({ "brain.enabled": !enabled })}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
            enabled ? "bg-accent-cyan" : "bg-surface-2",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-4 rounded-full bg-background transition-transform",
              enabled && "translate-x-4",
            )}
          />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="brain-model" className="text-sm text-foreground">
          Model
        </label>
        <select
          id="brain-model"
          className={field}
          value={listed ? (installed.find((name) => sameModel(name, model)) ?? model) : model}
          disabled={saving || status === null}
          aria-describedby="brain-model-hint"
          onChange={(e) => void save({ "brain.model": e.target.value })}
        >
          {!listed && <option value={model}>{status?.ollamaRunning ? `${model} (not installed)` : model}</option>}
          {installed.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <p id="brain-model-hint" className="text-xs text-muted-foreground">
          Smaller is faster. phi4-mini answers in about a second on this PC; larger models were too slow to route with.
        </p>
      </div>

      <div className="flex flex-col gap-1 text-xs" aria-live="polite">
        {status === null && !loadFailed && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Checking the model…
          </p>
        )}
        {loadFailed && (
          <p className="flex flex-wrap items-center gap-2 text-status-warning">
            Couldn&rsquo;t read the mini brain&rsquo;s status.
            <button type="button" className={button} onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}
        {status && ready && (
          <>
            <p className={ready.tone === "ok" ? "text-status-success" : "text-status-warning"}>{ready.text}</p>
            <p className="text-muted-foreground">
              {status.persona === "soul"
                ? "Personality: from Hermes's SOUL.md."
                : "Personality: built-in starter (SOUL.md is missing or over 1,500 characters)."}
            </p>
            {status.lastAnswerMs !== null && (
              <p className="tabular-nums text-muted-foreground">Last answer: {status.lastAnswerMs.toLocaleString("en-US")} ms.</p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} disabled={testing || saving} onClick={() => void test()}>
          {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          Test
        </button>
        {testResult && (
          <span role="status" className="text-xs text-muted-foreground">
            {testResult}
          </span>
        )}
        {error && (
          <span role="alert" className="text-xs text-status-warning">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
