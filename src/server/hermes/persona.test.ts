import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HermesNotInstalledError, loadPersona, personaPath, savePersona } from "./persona";

describe("Hermes personality file", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-"));
    vi.stubEnv("HERMES_HOME", dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("is SOUL.md inside Hermes's home", () => {
    expect(personaPath()).toBe(path.join(dir, "SOUL.md"));
  });

  it("reports Hermes as not installed when its home is missing, and refuses to save", async () => {
    vi.stubEnv("HERMES_HOME", path.join(dir, "nope"));

    expect(await loadPersona()).toEqual({ installed: false, exists: false, text: "" });
    await expect(savePersona("hi")).rejects.toBeInstanceOf(HermesNotInstalledError);
    expect(existsSync(path.join(dir, "nope"))).toBe(false);
  });

  it("loads empty text when SOUL.md is missing and creates it on first save without a backup", async () => {
    expect(await loadPersona()).toEqual({ installed: true, exists: false, text: "" });

    expect(await savePersona("You are Nova.")).toEqual({ backupPath: null });

    expect(await loadPersona()).toEqual({ installed: true, exists: true, text: "You are Nova." });
  });

  it("backs the old file up before replacing it", async () => {
    await fs.writeFile(path.join(dir, "SOUL.md"), "old");

    const { backupPath } = await savePersona("new");

    expect(await fs.readFile(backupPath!, "utf-8")).toBe("old");
    expect((await loadPersona()).text).toBe("new");
  });

  it("loads a file longer than the limit in full", async () => {
    await fs.writeFile(path.join(dir, "SOUL.md"), "x".repeat(6000));

    expect((await loadPersona()).text).toHaveLength(6000);
  });
});
