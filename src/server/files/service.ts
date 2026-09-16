import fs from "node:fs/promises";
import path from "node:path";

export type FileKind = "code" | "style" | "doc";

export interface RecentFileEntry {
  name: string;
  path: string;
  kind: FileKind;
  mtimeMs: number;
}

const EXCLUDED_DIRS = new Set(["node_modules", ".next", ".git", "data", ".vscode"]);
const MAX_DEPTH = 6;

const STYLE_EXTENSIONS = new Set([".css", ".scss"]);
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".json"]);

function kindFor(filePath: string): FileKind {
  const ext = path.extname(filePath).toLowerCase();
  if (STYLE_EXTENSIONS.has(ext)) return "style";
  if (DOC_EXTENSIONS.has(ext)) return "doc";
  return "code";
}

async function walk(dir: string, root: string, depth: number, out: RecentFileEntry[]): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      await walk(fullPath, root, depth + 1, out);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        out.push({
          name: entry.name,
          path: path.relative(root, fullPath).split(path.sep).join("/"),
          kind: kindFor(entry.name),
          mtimeMs: stat.mtimeMs,
        });
      } catch {
        // File may have been removed mid-walk — skip it.
      }
    }
  }
}

/** Scans the project directory for the most recently modified files. Excludes build/dependency/data dirs and dotfiles. */
export async function listRecentFiles(limit = 8): Promise<RecentFileEntry[]> {
  const root = process.cwd();
  const found: RecentFileEntry[] = [];
  await walk(root, root, 0, found);
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.slice(0, limit);
}
