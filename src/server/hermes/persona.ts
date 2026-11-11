import { promises as fs } from "node:fs";
import path from "node:path";
import { hermesHome } from "./config";
import { replaceWithBackup } from "./safe-write";

/**
 * Hermes takes its personality from SOUL.md in its home folder, and reads it
 * when it builds a conversation's system prompt. That file is the source of
 * truth: the dashboard reads and replaces it, and keeps no copy of its own.
 */

export class HermesNotInstalledError extends Error {
  constructor() {
    super("Hermes isn't installed on this PC.");
    this.name = "HermesNotInstalledError";
  }
}

/** Always SOUL.md inside Hermes's home; nothing from a request ever reaches this path. */
export function personaPath(): string {
  return path.join(hermesHome(), "SOUL.md");
}

async function hermesIsInstalled(): Promise<boolean> {
  try {
    return (await fs.stat(hermesHome())).isDirectory();
  } catch {
    return false;
  }
}

export interface PersonaFile {
  /** False when Hermes's home folder is missing, so there is nowhere to keep a personality. */
  installed: boolean;
  /** False when Hermes is installed but has no SOUL.md yet. */
  exists: boolean;
  /** The whole file, however long; the length limit applies to saving, never to reading. */
  text: string;
}

export async function loadPersona(): Promise<PersonaFile> {
  if (!(await hermesIsInstalled())) return { installed: false, exists: false, text: "" };
  try {
    return { installed: true, exists: true, text: await fs.readFile(personaPath(), "utf-8") };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { installed: true, exists: false, text: "" };
    throw err;
  }
}

/** Backs the current SOUL.md up beside it, then replaces it. Never creates Hermes's home folder. */
export async function savePersona(text: string): Promise<{ backupPath: string | null }> {
  if (!(await hermesIsInstalled())) throw new HermesNotInstalledError();
  return replaceWithBackup(personaPath(), text);
}
