import { promises as fs } from "node:fs";

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/**
 * Replaces a file in one step, so a crash can never leave half of it, after
 * copying the current version beside it as `<file>.bak-dashboard-<time>`.
 * A file that does not exist yet is simply created (no backup). The folder is
 * never created: a missing folder rejects and leaves nothing behind.
 */
export async function replaceWithBackup(file: string, text: string): Promise<{ backupPath: string | null }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let backupPath: string | null = `${file}.bak-dashboard-${stamp}`;
  try {
    await fs.copyFile(file, backupPath);
  } catch (err) {
    if (!isMissing(err)) throw err;
    backupPath = null;
  }

  const tmp = `${file}.tmp-${process.pid}`;
  try {
    await fs.writeFile(tmp, text, "utf-8");
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  return { backupPath };
}
