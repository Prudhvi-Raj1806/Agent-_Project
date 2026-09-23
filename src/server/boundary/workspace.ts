import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Disposable workspace isolation for the external execution boundary.
 *
 * Convention: workspaces live under `data/runtime/boundary-workspaces/`,
 * next to `data/jarvis.sqlite` (this project's existing convention of
 * keeping local runtime state under `data/`, not scattered into the repo
 * root or the OS temp dir shared with unrelated processes).
 */

const RUNTIME_ROOT = path.resolve(process.cwd(), "data", "runtime", "boundary-workspaces");

export function runtimeRoot(): string {
  return RUNTIME_ROOT;
}

/** Creates a fresh, empty, uniquely-named workspace directory and returns its canonical (realpath) absolute path. */
export async function createWorkspace(missionId: string): Promise<string> {
  await fsp.mkdir(RUNTIME_ROOT, { recursive: true });
  const dirName = `${sanitizeForPath(missionId)}-${randomUUID()}`;
  const dir = path.join(RUNTIME_ROOT, dirName);
  await fsp.mkdir(dir, { recursive: true });
  // realpath resolves any symlink components in the parent chain up front,
  // so every later containment check compares against the true resolved root.
  return fsp.realpath(dir);
}

export async function cleanupWorkspace(workspaceRoot: string): Promise<void> {
  await fsp.rm(workspaceRoot, { recursive: true, force: true });
}

function sanitizeForPath(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "mission";
}

export class PathEscapeError extends Error {
  constructor(requestedPath: string, root: string) {
    super(`Path "${requestedPath}" resolves outside the permitted workspace root "${root}".`);
    this.name = "PathEscapeError";
  }
}

/**
 * Canonicalizes `candidatePath` (relative or absolute) against `root` and
 * verifies the RESOLVED REAL path — not the bare string — stays inside
 * `root`. This is the load-bearing check: a bare `path.join`/`path.resolve`
 * string comparison is not sufficient, because:
 *   - `..` segments can walk out of the root before any existence check runs
 *   - a symlink or NTFS junction placed inside the root can point outside it
 *     and a naive string check would never notice
 *
 * Strategy: resolve the absolute path syntactically first (catches `..`
 * traversal even for a path that doesn't exist yet, e.g. a file about to be
 * created), then additionally realpath as much of the path as already
 * exists on disk (catches a symlink/junction escape for any existing
 * ancestor directory) and verify that resolved prefix is still inside root.
 */
export function resolveWithinWorkspace(root: string, candidatePath: string): string {
  const canonicalRoot = path.resolve(root);
  const absoluteCandidate = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(canonicalRoot, candidatePath);

  if (!isInside(canonicalRoot, absoluteCandidate)) {
    throw new PathEscapeError(candidatePath, canonicalRoot);
  }

  // Walk up from the candidate to find the nearest existing ancestor, and
  // realpath it — this defeats a symlink/junction placed inside the
  // workspace that points outside it, even though the syntactic path above
  // looked contained.
  let existingAncestor = absoluteCandidate;
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break; // reached filesystem root without finding anything
    existingAncestor = parent;
  }
  if (fs.existsSync(existingAncestor)) {
    const realAncestor = fs.realpathSync(existingAncestor);
    if (!isInside(canonicalRoot, realAncestor)) {
      throw new PathEscapeError(candidatePath, canonicalRoot);
    }
  }

  return absoluteCandidate;
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
