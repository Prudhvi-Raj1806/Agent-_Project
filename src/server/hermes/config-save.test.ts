import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveHermesConfigText } from "./config";

describe("saveHermesConfigText", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-config-"));
    vi.stubEnv("HERMES_HOME", dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("backs the config up and replaces it", async () => {
    const file = path.join(dir, "config.yaml");
    await fs.writeFile(file, "old");

    const { backupPath } = await saveHermesConfigText("new");

    expect(await fs.readFile(file, "utf-8")).toBe("new");
    expect(await fs.readFile(backupPath, "utf-8")).toBe("old");
  });

  it("never creates a config that was not there", async () => {
    await expect(saveHermesConfigText("new")).rejects.toThrow();

    expect(existsSync(path.join(dir, "config.yaml"))).toBe(false);
    expect(await fs.readdir(dir)).toEqual([]);
  });
});
