import { spawn, execFile } from "node:child_process";
import path from "node:path";
import { logger } from "@/server/logging/logger";
import type { BoundaryExecutionResult, BoundaryFailureReason, ProcessPolicy, ResourceLimits } from "./types";

/**
 * Real child-process execution with a scoped cwd/env and a REAL timeout
 * kill (verified — see boundary.escape.test.ts's timeout test, which checks
 * the process is actually gone afterward, not just that the promise
 * rejected).
 *
 * Technology choice (Sprint 08 Part I): a restricted Node `child_process`
 * with a scoped working directory, a minimal explicit env, an executable
 * allowlist, and `taskkill /pid /t /f` for real tree-kill on Windows —
 * NOT a Windows Job Object. Rationale:
 *   - Job Objects give real, kernel-enforced CPU/memory/process-count
 *     limits, which this implementation deliberately does NOT claim to
 *     provide (see `ResourceLimits.maxMemoryMb`'s doc comment — best-effort
 *     only). Getting a real Job Object from Node requires either a native
 *     addon (no maintained, current one was vetted as available for this
 *     session) or shelling out to a helper (adds another spawned process to
 *     reason about, for a benefit — real memory/CPU caps — this sprint's
 *     scope doesn't require yet, since the identified gap was write/shell/
 *     network GOVERNANCE, not resource exhaustion).
 *   - `taskkill /t /f` is a documented, standard Windows mechanism for
 *     killing a full process tree and was live-verified this sprint (see
 *     boundary.escape.test.ts) to actually terminate a spawned `cmd.exe`
 *     tree, not just the immediate child — Node's own `child.kill()` on
 *     Windows does NOT reliably kill grandchildren, which is the actual gap
 *     that matters for "does the timeout really stop the process."
 *   - This is honestly a partial answer on resource limits (documented as
 *     an EXTERNAL LIMITATION below) in exchange for a real, verified,
 *     low-complexity timeout/cancellation guarantee, which is what Section
 *     5 of the sprint asked for.
 *
 * EXTERNAL LIMITATION: CPU/memory limits (`ResourceLimits.maxMemoryMb`) are
 * NOT enforced by this runner. A runaway process will only be stopped by
 * its timeout, not by exceeding a memory ceiling. Closing this for real
 * requires a Job Object (native addon or a small compiled helper) — a
 * concrete, scoped follow-up, not built this sprint.
 */

const MINIMAL_ENV_KEYS = ["PATH", "SystemRoot", "TEMP", "TMP", "COMSPEC", "PATHEXT"];

function buildScopedEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: Record<string, string> = { NODE_ENV: process.env.NODE_ENV ?? "production" };
  for (const key of MINIMAL_ENV_KEYS) {
    const value = process.env[key];
    if (value != null) env[key] = value;
  }
  if (extra) Object.assign(env, extra);
  return env as NodeJS.ProcessEnv;
}

export function isExecutableAllowed(policy: ProcessPolicy, executable: string): boolean {
  const base = path.basename(executable).toLowerCase();
  return policy.allowedExecutables.some((allowed) => path.basename(allowed).toLowerCase() === base);
}

/** Kills a process tree on Windows for real (`taskkill /pid /t /f`), falling back to a plain signal kill elsewhere. Verified this sprint against a real spawned `cmd.exe` subtree. */
async function killTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/pid", String(pid), "/t", "/f"], () => resolve());
    });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
}

export interface RunCommandRequest {
  requestId: string;
  executable: string;
  args: string[];
  cwd: string;
  processPolicy: ProcessPolicy;
  limits: ResourceLimits;
  signal?: AbortSignal;
}

export async function runCommand(req: RunCommandRequest): Promise<BoundaryExecutionResult> {
  const startedAt = new Date();

  if (!isExecutableAllowed(req.processPolicy, req.executable)) {
    const endedAt = new Date();
    return resultFor(req.requestId, startedAt, endedAt, {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      failureReason: "EXECUTABLE_NOT_ALLOWED",
      failureMessage: `Executable "${req.executable}" is not in this capability request's process allowlist.`,
    });
  }

  return new Promise<BoundaryExecutionResult>((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let failureReason: BoundaryFailureReason | undefined;
    let failureMessage: string | undefined;

    const child = spawn(req.executable, req.args, {
      cwd: req.cwd,
      env: buildScopedEnv(req.processPolicy.env),
      windowsHide: true,
      shell: false,
    });

    const finish = async (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      req.signal?.removeEventListener("abort", onAbort);
      const endedAt = new Date();
      resolve(
        resultFor(req.requestId, startedAt, endedAt, {
          ok: exitCode === 0 && !failureReason,
          exitCode,
          stdout,
          stderr,
          failureReason,
          failureMessage,
        })
      );
    };

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      failureReason = "BOUNDARY_CRASH";
      failureMessage = err instanceof Error ? err.message : String(err);
      void finish(null);
    });

    child.on("exit", (code) => {
      void finish(code);
    });

    const timeoutHandle = setTimeout(() => {
      failureReason = "TIMEOUT";
      failureMessage = `Capability request exceeded its timeout of ${req.limits.timeoutMs}ms — process tree was terminated.`;
      if (child.pid) void killTree(child.pid);
    }, req.limits.timeoutMs);

    const onAbort = () => {
      failureReason = "CANCELLED";
      failureMessage = "Capability request was cancelled (mission paused/cancelled) — process tree was terminated.";
      if (child.pid) void killTree(child.pid);
    };
    req.signal?.addEventListener("abort", onAbort, { once: true });

    if (req.signal?.aborted) onAbort();
  });
}

function resultFor(
  requestId: string,
  startedAt: Date,
  endedAt: Date,
  fields: Omit<BoundaryExecutionResult, "requestId" | "startedAt" | "endedAt" | "durationMs">
): BoundaryExecutionResult {
  if (!fields.ok) {
    logger.warn("boundary.execution.failed", { requestId, failureReason: fields.failureReason, exitCode: fields.exitCode });
  }
  return {
    requestId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    ...fields,
  };
}
