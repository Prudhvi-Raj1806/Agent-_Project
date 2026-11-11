import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { replaceWithBackup } from "./safe-write";

describe("replaceWithBackup", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-write-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const leftovers = async () => (await fs.readdir(dir)).filter((name) => name.includes(".tmp-"));

  it("replaces an existing file and keeps the old text in a backup beside it", async () => {
    const file = path.join(dir, "SOUL.md");
    await fs.writeFile(file, "old");

    const { backupPath } = await replaceWithBackup(file, "new");

    expect(await fs.readFile(file, "utf-8")).toBe("new");
    expect(backupPath).not.toBeNull();
    expect(path.dirname(backupPath!)).toBe(dir);
    expect(path.basename(backupPath!)).toMatch(/^SOUL\.md\.bak-dashboard-/);
    expect(await fs.readFile(backupPath!, "utf-8")).toBe("old");
    expect(await leftovers()).toEqual([]);
  });

  it("creates a file that does not exist yet, with no backup", async () => {
    const file = path.join(dir, "SOUL.md");

    expect(await replaceWithBackup(file, "first")).toEqual({ backupPath: null });

    expect(await fs.readFile(file, "utf-8")).toBe("first");
    expect(await fs.readdir(dir)).toEqual(["SOUL.md"]);
  });

  it("rejects and creates nothing when the folder does not exist", async () => {
    const missing = path.join(dir, "nope");

    await expect(replaceWithBackup(path.join(missing, "SOUL.md"), "x")).rejects.toThrow();

    expect(existsSync(missing)).toBe(false);
  });
});
