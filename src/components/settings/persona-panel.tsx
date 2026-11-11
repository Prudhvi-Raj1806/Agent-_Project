"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PERSONA_LIMIT, starterPersona } from "@/lib/persona";
import { useAppSettings } from "@/lib/settings/app-settings-context";
import { cn } from "@/lib/utils";

type PersonaState =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "not-installed" }
  | { kind: "ready"; exists: boolean };

interface Notice {
  tone: "ok" | "warn";
  text: string;
}

const field =
  "w-full rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground placeholder:text-text-dim disabled:opacity-50";
const button =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50";

/** A line break is one character, whatever the browser hands back. */
const lengthOf = (text: string) => text.replace(/\r\n/g, "\n").length;

function NoticeLine({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <p
      role={notice.tone === "ok" ? "status" : "alert"}
      className={cn("text-xs", notice.tone === "ok" ? "text-status-success" : "text-status-warning")}
    >
      {notice.text}
    </p>
  );
}

/**
 * What the assistant is called, what it calls its owner, and how it speaks.
 * The two names are dashboard settings; the personality is Hermes's own
 * SOUL.md, so the two parts save separately.
 */
export function PersonaPanel() {
  const { settings, update } = useAppSettings();
  const router = useRouter();
  const savedName = settings["persona.name"];
  const savedOwner = settings["persona.ownerName"];

  const [name, setName] = useState(savedName);
  const [ownerName, setOwnerName] = useState(savedOwner);
  const [savingNames, setSavingNames] = useState(false);
  const [namesNotice, setNamesNotice] = useState<Notice | null>(null);

  const [persona, setPersona] = useState<PersonaState>({ kind: "loading" });
  const [savedText, setSavedText] = useState("");
  const [text, setText] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [textNotice, setTextNotice] = useState<Notice | null>(null);

  const loadPersona = useCallback(async () => {
    try {
      const res = await fetch("/api/hermes/persona");
      const body = (await res.json().catch(() => ({}))) as {
        installed?: boolean;
        exists?: boolean;
        text?: string;
        error?: string;
      };
      if (!res.ok) {
        setPersona({ kind: "failed", message: body.error ?? "Couldn't read the personality file." });
        return;
      }
      if (!body.installed) {
        setPersona({ kind: "not-installed" });
        return;
      }
      const loaded = body.text ?? "";
      setSavedText(loaded);
      setText(loaded);
      setPersona({ kind: "ready", exists: Boolean(body.exists) });
    } catch {
      setPersona({ kind: "failed", message: "Couldn't reach the dashboard to read the personality." });
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void loadPersona(), 0);
    return () => clearTimeout(first);
  }, [loadPersona]);

  const namesChanged = name.trim() !== savedName || ownerName.trim() !== savedOwner;
  const namesFilled = name.trim() !== "" && ownerName.trim() !== "";

  const saveNames = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!namesChanged || !namesFilled || savingNames) return;
    setSavingNames(true);
    setNamesNotice(null);
    try {
      await update({ "persona.name": name.trim(), "persona.ownerName": ownerName.trim() });
      setName(name.trim());
      setOwnerName(ownerName.trim());
      setNamesNotice({ tone: "ok", text: "Saved." });
      // Headings rendered on the server and the tab title follow on refresh.
      router.refresh();
    } catch (err) {
      setNamesNotice({ tone: "warn", text: err instanceof Error ? err.message : "Couldn't save the names." });
    } finally {
      setSavingNames(false);
    }
  };

  const used = lengthOf(text);
  const over = used - PERSONA_LIMIT;
  const textChanged = text !== savedText;
  const canSaveText = textChanged && text.trim() !== "" && over <= 0 && !savingText;

  const saveText = async () => {
    if (!canSaveText) return;
    setSavingText(true);
    setTextNotice(null);
    try {
      const res = await fetch("/api/hermes/persona", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json().catch(() => ({}))) as { text?: string; backupPath?: string | null; error?: string };
      if (!res.ok) {
        setTextNotice({ tone: "warn", text: body.error ?? "Couldn't save the personality." });
        return;
      }
      const stored = body.text ?? text;
      setSavedText(stored);
      setText(stored);
      setPersona({ kind: "ready", exists: true });
      setTextNotice({
        tone: "ok",
        text: body.backupPath
          ? "Saved. Applies to the next conversation. The previous version was backed up."
          : "Saved. Applies to the next conversation.",
      });
    } catch {
      setTextNotice({ tone: "warn", text: "Couldn't reach the dashboard to save the personality." });
    } finally {
      setSavingText(false);
    }
  };

  const resetToStarter = () => {
    setText(starterPersona(name.trim() || savedName, ownerName.trim() || savedOwner));
    setTextNotice(null);
  };

  const mentionsName = text.toLowerCase().includes(savedName.toLowerCase());

  return (
    <div className="flex flex-col">
      <form onSubmit={saveNames} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="persona-name" className="text-sm text-foreground">
              Assistant name
            </label>
            <input
              id="persona-name"
              className={field}
              value={name}
              maxLength={24}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="persona-name-hint"
              onChange={(e) => setName(e.target.value)}
            />
            <p id="persona-name-hint" className="text-xs text-muted-foreground">
              Spotify shows the new name after the next reload.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="persona-owner" className="text-sm text-foreground">
              Your name
            </label>
            <input
              id="persona-owner"
              className={field}
              value={ownerName}
              maxLength={24}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="persona-owner-hint"
              onChange={(e) => setOwnerName(e.target.value)}
            />
            <p id="persona-owner-hint" className="text-xs text-muted-foreground">
              Used in greetings and spoken briefings.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={button} disabled={!namesChanged || !namesFilled || savingNames}>
            {savingNames && <Loader2 className="size-3.5 animate-spin" />}
            Save names
          </button>
          <NoticeLine notice={namesNotice} />
        </div>
      </form>

      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="persona-text" className="text-sm text-foreground">
            Personality
          </label>
          {persona.kind === "ready" && (
            <span
              className={cn("text-xs tabular-nums", over > 0 ? "text-status-warning" : "text-muted-foreground")}
              aria-live="polite"
            >
              {used.toLocaleString("en-US")} / {PERSONA_LIMIT.toLocaleString("en-US")}
            </span>
          )}
        </div>

        {persona.kind === "loading" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Reading Hermes&rsquo;s personality…
          </p>
        )}

        {persona.kind === "failed" && (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-xs text-status-warning">
              {persona.message}
            </p>
            <button type="button" className={button} onClick={() => void loadPersona()}>
              Retry
            </button>
          </div>
        )}

        {persona.kind === "not-installed" && (
          <p className="text-sm text-muted-foreground">
            Hermes isn&rsquo;t installed on this PC, so there is no personality to edit.
          </p>
        )}

        {persona.kind === "ready" && (
          <>
            <textarea
              id="persona-text"
              className={cn(field, "min-h-56 resize-y leading-relaxed")}
              value={text}
              spellCheck
              aria-describedby="persona-text-hint"
              aria-invalid={over > 0}
              onChange={(e) => {
                setText(e.target.value);
                setTextNotice(null);
              }}
            />
            <p id="persona-text-hint" className="text-xs text-muted-foreground">
              {persona.exists
                ? "This is Hermes's own SOUL.md: the instructions it reads before every conversation."
                : "Hermes has no personality file yet. Start from the starter or write your own."}
            </p>
            {over > 0 && (
              <p className="text-xs text-status-warning">
                {over.toLocaleString("en-US")} {over === 1 ? "character" : "characters"} over the limit. Shorten it to save.
              </p>
            )}
            {text.trim() !== "" && !mentionsName && (
              <p className="text-xs text-status-warning">
                The personality doesn&rsquo;t mention {savedName}. Hermes will keep introducing itself by whatever name is
                written here.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={button} disabled={!canSaveText} onClick={() => void saveText()}>
                {savingText && <Loader2 className="size-3.5 animate-spin" />}
                Save personality
              </button>
              <button type="button" className={button} disabled={savingText} onClick={resetToStarter}>
                Reset to starter
              </button>
              <NoticeLine notice={textNotice} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
