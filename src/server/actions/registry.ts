import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { logger } from "@/server/logging/logger";
import type { ActionDefinition, ActionRunResult } from "./types";

const execFileAsync = promisify(execFile);

const NOTES_PATH = path.join(process.cwd(), "data", "notes.md");
const SCREENSHOTS_DIR = path.join(process.cwd(), "data", "screenshots");

async function openVsCode(): Promise<ActionRunResult> {
  try {
    await execFileAsync("cmd", ["/c", "code", "."], { cwd: process.cwd() });
    return { ok: true, message: "Opened VS Code." };
  } catch (err) {
    return { ok: false, message: "Couldn't open VS Code — is it installed and on PATH?", detail: String(err) };
  }
}

async function takeNotes(): Promise<ActionRunResult> {
  try {
    await fs.mkdir(path.dirname(NOTES_PATH), { recursive: true });
    try {
      await fs.access(NOTES_PATH);
    } catch {
      await fs.writeFile(NOTES_PATH, "# JARVIS Notes\n\n", "utf-8");
    }
    await execFileAsync("cmd", ["/c", "start", "", NOTES_PATH]);
    return { ok: true, message: "Opened notes.md." };
  } catch (err) {
    return { ok: false, message: "Couldn't open the notes file.", detail: String(err) };
  }
}

async function takeScreenshot(): Promise<ActionRunResult> {
  try {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
    const file = path.join(SCREENSHOTS_DIR, `screenshot-${Date.now()}.png`);
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms,System.Drawing",
      "$b = [System.Windows.Forms.SystemInformation]::VirtualScreen",
      "$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height",
      "$g = [System.Drawing.Graphics]::FromImage($bmp)",
      "$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)",
      `$bmp.Save('${file.replace(/'/g, "''")}')`,
      "$g.Dispose(); $bmp.Dispose()",
    ].join("; ");
    await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);
    return { ok: true, message: "Screenshot saved.", detail: path.relative(process.cwd(), file) };
  } catch (err) {
    return { ok: false, message: "Couldn't take a screenshot.", detail: String(err) };
  }
}

async function findObsidian(): Promise<string | null> {
  const candidates = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Obsidian", "Obsidian.exe") : null,
  ].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // not here — try the next candidate
    }
  }
  try {
    const { stdout } = await execFileAsync("where", ["obsidian"]);
    const first = stdout.split(/\r?\n/).find((line) => line.trim());
    return first?.trim() ?? null;
  } catch {
    return null;
  }
}

async function openObsidian(): Promise<ActionRunResult> {
  const exePath = await findObsidian();
  if (!exePath) {
    return { ok: false, message: "Obsidian doesn't appear to be installed on this machine." };
  }
  try {
    await execFileAsync("cmd", ["/c", "start", "", exePath]);
    return { ok: true, message: "Opened Obsidian." };
  } catch (err) {
    return { ok: false, message: "Found Obsidian but couldn't launch it.", detail: String(err) };
  }
}

const ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";

async function summarizeClipboard(): Promise<ActionRunResult> {
  let clipboardText: string;
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-Clipboard -Raw",
    ]);
    clipboardText = stdout.trim();
  } catch (err) {
    return { ok: false, message: "Couldn't read the clipboard.", detail: String(err) };
  }

  if (!clipboardText) {
    return { ok: false, message: "Clipboard is empty." };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      message: "No LLM connected (set ANTHROPIC_API_KEY to enable real summarization) — showing raw clipboard text:",
      detail: clipboardText.slice(0, 2000),
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: `Summarize this concisely:\n\n${clipboardText.slice(0, 8000)}` }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, message: "Summarization request failed.", detail: errBody.slice(0, 500) };
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const summary = data.content?.[0]?.text;
    if (!summary) return { ok: false, message: "Couldn't parse a summary from the response." };
    return { ok: true, message: "Clipboard summarized.", detail: summary };
  } catch (err) {
    return { ok: false, message: "Summarization request failed.", detail: String(err) };
  }
}

/**
 * Phase 1 stub for the risky "Control Computer" action. Locking the screen is
 * a real, safe, fully-reversible OS action — proof the verify-then-execute
 * pipeline works end to end. Broader automation (mouse/keyboard control) is
 * a future phase and is deliberately NOT built here.
 */
async function controlComputer(): Promise<ActionRunResult> {
  try {
    await execFileAsync("rundll32.exe", ["user32.dll,LockWorkStation"]);
    return { ok: true, message: "Verified — locked the workstation." };
  } catch (err) {
    return { ok: false, message: "Couldn't execute the control-computer action.", detail: String(err) };
  }
}

/**
 * Inspired by a completely separate "clap → welcome routine" Python script
 * the user pointed at (github.com/hectorg2211/jarvis) — opens the apps a
 * real Hermes/Spotify session run this way. Speaking the greeting and
 * resuming Spotify playback happen client-side (this only launches apps a
 * server action can reach) — see use-clap-detector.ts's caller.
 */
async function welcomeRoutine(): Promise<ActionRunResult> {
  const opened: string[] = [];
  try {
    await execFileAsync("cmd", ["/c", "code", "."], { cwd: process.cwd() });
    opened.push("VS Code");
  } catch {
    // best-effort — not installed/on PATH is fine, other steps still run
  }
  try {
    await execFileAsync("cmd", ["/c", "start", "", "http://localhost:3000"]);
    opened.push("your browser");
  } catch {
    // best-effort
  }
  if (opened.length === 0) {
    return { ok: false, message: "Couldn't open anything for the welcome routine." };
  }
  return { ok: true, message: `Welcome routine ran — opened ${opened.join(" and ")}.` };
}

function withLogging(id: string, run: () => Promise<ActionRunResult>): () => Promise<ActionRunResult> {
  return async () => {
    const result = await run();
    logger.info("action.run", { id, ok: result.ok });
    return result;
  };
}

export const ACTION_REGISTRY: Record<string, ActionDefinition> = {
  "open-vscode": { id: "open-vscode", label: "Open VS Code", risk: "safe", run: withLogging("open-vscode", openVsCode) },
  "take-notes": { id: "take-notes", label: "Take Notes", risk: "safe", run: withLogging("take-notes", takeNotes) },
  "take-screenshot": {
    id: "take-screenshot",
    label: "Take a Screenshot",
    risk: "safe",
    run: withLogging("take-screenshot", takeScreenshot),
  },
  "open-obsidian": {
    id: "open-obsidian",
    label: "Open Obsidian",
    risk: "safe",
    run: withLogging("open-obsidian", openObsidian),
  },
  "summarize-clipboard": {
    id: "summarize-clipboard",
    label: "Summarize Clipboard",
    risk: "safe",
    run: withLogging("summarize-clipboard", summarizeClipboard),
  },
  "control-computer": {
    id: "control-computer",
    label: "Control Computer",
    risk: "risky",
    run: withLogging("control-computer", controlComputer),
  },
  "welcome-routine": {
    id: "welcome-routine",
    label: "Welcome Routine",
    risk: "safe",
    run: withLogging("welcome-routine", welcomeRoutine),
  },
};

export function listActionSummaries() {
  return Object.values(ACTION_REGISTRY).map(({ id, label, risk }) => ({ id, label, risk }));
}
