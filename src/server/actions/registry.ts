import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getBrand } from "@/server/settings/brand";
import { nowIso } from "@/server/db/util";
import { logger } from "@/server/logging/logger";
import { selectModel } from "@/server/omnirouter/router";
import { runProviderCompletion } from "@/server/providers/completion";
import { fileExists } from "@/server/tools/verification";
import type { VerificationResult } from "@/server/verification/types";
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
      await fs.writeFile(NOTES_PATH, `# ${getBrand()} Notes\n\n`, "utf-8");
    }
    await execFileAsync("cmd", ["/c", "start", "", NOTES_PATH]);
    return { ok: true, message: "Opened notes.md." };
  } catch (err) {
    return { ok: false, message: "Couldn't open the notes file.", detail: String(err) };
  }
}

/**
 * A real, reliable observation for `take-notes`: does `data/notes.md`
 * genuinely exist after the action ran? (Sprint 03 Section 7's "at least
 * one real postcondition.") `takeNotes()` only ever creates the file if it
 * doesn't already exist — either way, its existence after a successful run
 * is the actual requested outcome, not just "the command didn't error."
 */
async function verifyNotesFile(): Promise<VerificationResult> {
  const relativePath = path.relative(process.cwd(), NOTES_PATH);
  const exists = await fileExists(NOTES_PATH);
  return exists
    ? { verdict: "PASS", reasons: [`Observed: ${relativePath} exists.`], checkedAt: nowIso(), strategy: "file-exists" }
    : { verdict: "FAIL", reasons: [`Expected file not found: ${relativePath}.`], checkedAt: nowIso(), strategy: "file-exists" };
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

/**
 * A real observation for `take-screenshot`: `takeScreenshot()` reports the
 * exact relative path it saved to (`detail`) — this checks that file
 * genuinely exists, rather than trusting the PowerShell script's own exit
 * code as proof the .png actually landed on disk.
 */
async function verifyScreenshotFile(result: ActionRunResult): Promise<VerificationResult> {
  if (!result.detail) {
    return {
      verdict: "UNCERTAIN",
      reasons: ["No screenshot file path was reported to observe."],
      checkedAt: nowIso(),
      strategy: "file-exists",
    };
  }
  const absolutePath = path.join(process.cwd(), result.detail);
  const exists = await fileExists(absolutePath);
  return exists
    ? { verdict: "PASS", reasons: [`Observed: ${result.detail} exists.`], checkedAt: nowIso(), strategy: "file-exists" }
    : {
        verdict: "FAIL",
        reasons: [`Expected screenshot file not found: ${result.detail}.`],
        checkedAt: nowIso(),
        strategy: "file-exists",
      };
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

/**
 * Routes through the same Model Router -> Provider abstraction chain a
 * mission uses (see JARVIS_MASTER_MEMORY.md) — this action must never call
 * a provider API directly. `selectModel`'s classification is driven by the
 * text passed as `objective`; a fixed "fast-general"-shaped stand-in is
 * fine here since this is a plain summarization, not an actual mission.
 */
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

  const routing = selectModel({ objective: "Summarize this clipboard text concisely." });
  if (!routing) {
    return {
      ok: true,
      message: "No healthy model provider available (set an API key to enable real summarization) — showing raw clipboard text:",
      detail: clipboardText.slice(0, 2000),
    };
  }

  const completion = await runProviderCompletion({
    routing,
    prompt: `Summarize this concisely:\n\n${clipboardText.slice(0, 8000)}`,
    maxTokens: 300,
  });

  if (!completion.ok) {
    return { ok: false, message: "Summarization request failed.", detail: completion.message };
  }
  return { ok: true, message: "Clipboard summarized.", detail: completion.text };
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
  "take-notes": {
    id: "take-notes",
    label: "Take Notes",
    risk: "safe",
    run: withLogging("take-notes", takeNotes),
    verificationStrategy: "file-exists",
    verify: verifyNotesFile,
  },
  "take-screenshot": {
    id: "take-screenshot",
    label: "Take a Screenshot",
    risk: "safe",
    run: withLogging("take-screenshot", takeScreenshot),
    verificationStrategy: "file-exists",
    verify: verifyScreenshotFile,
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
