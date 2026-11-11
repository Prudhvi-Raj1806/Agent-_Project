import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { replaceWithBackup } from "./safe-write";

/**
 * Reads and edits the one part of Hermes's own `config.yaml` the dashboard
 * manages: which provider and model it runs on. This is deliberately a
 * narrow text edit, not a YAML round-trip — comments, key order and line
 * endings elsewhere in the file are left exactly as they were, and nothing
 * here ever reads or writes an API key.
 */

export interface ModelSelection {
  provider: string;
  model: string;
}

export interface ModelChoice {
  provider: string;
  label: string;
  models: string[];
}

/** Hermes's built-in Gemini provider isn't listed under `providers:`, so it's described here. */
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_CHOICE: ModelChoice = {
  provider: "gemini",
  label: "Google Gemini",
  models: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest"],
};

const SAFE_PROVIDER = /^[\w.-]+$/;
const SAFE_MODEL = /^[\w.:/-]+$/;
const TOP_LEVEL_KEY = /^[A-Za-z_][\w-]*:/;

function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** `[start, end)` of a top-level block: its `key:` line through the line before the next top-level key. */
function findBlock(lines: string[], key: string): [number, number] | null {
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !TOP_LEVEL_KEY.test(lines[end])) end++;
  return [start, end];
}

function scalar(raw: string): string {
  return raw.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
}

export function readModelSelection(text: string): ModelSelection | null {
  const lines = splitLines(text);
  const block = findBlock(lines, "model");
  if (!block) return null;
  let provider = "";
  let model = "";
  for (const line of lines.slice(block[0] + 1, block[1])) {
    const m = /^ {2}(provider|default):\s*(.+)$/.exec(line);
    if (!m) continue;
    if (m[1] === "provider") provider = scalar(m[2]);
    else model = scalar(m[2]);
  }
  return provider && model ? { provider, model } : null;
}

export function readModelChoices(text: string): ModelChoice[] {
  const lines = splitLines(text);
  const block = findBlock(lines, "providers");
  const choices: ModelChoice[] = [];
  if (block) {
    let current: ModelChoice | null = null;
    let inModels = false;
    for (const line of lines.slice(block[0] + 1, block[1])) {
      const provider = /^ {2}([\w.-]+):\s*$/.exec(line);
      if (provider) {
        current = { provider: provider[1], label: provider[1], models: [] };
        choices.push(current);
        inModels = false;
        continue;
      }
      if (!current) continue;
      const name = /^ {4}name:\s*(.+)$/.exec(line);
      if (name) {
        current.label = scalar(name[1]);
        inModels = false;
        continue;
      }
      if (/^ {4}models:\s*$/.test(line)) {
        inModels = true;
        continue;
      }
      const item = /^ {6}-\s*(.+)$/.exec(line);
      if (inModels && item) {
        current.models.push(scalar(item[1]));
        continue;
      }
      if (/^ {4}\S/.test(line)) inModels = false;
    }
  }
  if (!choices.some((c) => c.provider === GEMINI_CHOICE.provider)) choices.push({ ...GEMINI_CHOICE });
  return choices.filter((c) => c.models.length > 0);
}

/**
 * Returns the config text with only the `model:` block changed. Throws if the
 * provider or model isn't one Hermes is configured for, so a request can't
 * smuggle arbitrary text into the file.
 */
export function applyModelChoice(text: string, choice: ModelSelection): string {
  if (!SAFE_PROVIDER.test(choice.provider)) throw new Error("Invalid provider.");
  if (!SAFE_MODEL.test(choice.model)) throw new Error("Invalid model.");

  const entry = readModelChoices(text).find((c) => c.provider === choice.provider);
  if (!entry) throw new Error(`Hermes has no provider named "${choice.provider}".`);
  if (!entry.models.includes(choice.model)) {
    throw new Error(`Hermes has no model "${choice.model}" listed for provider "${choice.provider}".`);
  }

  const eol = eolOf(text);
  const lines = splitLines(text);
  const block = findBlock(lines, "model");
  const managed = /^ {2}(base_url|default|provider):/;
  const kept = block ? lines.slice(block[0] + 1, block[1]).filter((l) => l.trim() !== "" && !managed.test(l)) : [];

  const next = [
    "model:",
    ...(choice.provider === GEMINI_CHOICE.provider ? [`  base_url: ${GEMINI_BASE_URL}`] : []),
    `  default: ${choice.model}`,
    `  provider: ${choice.provider}`,
    ...kept,
  ];
  if (!block) return [...next, ...lines].join(eol);
  return [...lines.slice(0, block[0]), ...next, ...lines.slice(block[1])].join(eol);
}

export function hermesHome(): string {
  return process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "hermes");
}

export function hermesConfigPath(): string {
  return path.join(hermesHome(), "config.yaml");
}

export async function loadHermesConfigText(): Promise<string> {
  return fs.readFile(hermesConfigPath(), "utf-8");
}

/** Backs the current file up beside itself, then replaces it in one step so a crash can't leave half a config. */
export async function saveHermesConfigText(text: string): Promise<{ backupPath: string }> {
  const file = hermesConfigPath();
  // A config is only ever replaced, never created: a missing one means Hermes isn't set up.
  await fs.access(file);
  const { backupPath } = await replaceWithBackup(file, text);
  if (!backupPath) throw new Error("Hermes's config was removed while it was being saved.");
  return { backupPath };
}
