import fsp from "node:fs/promises";
import { recordAudit } from "@/server/security/audit";
import type { FailureClassification } from "@/server/verification/classification";
import { checkNetworkAllowed } from "./network-policy";
import { runCommand } from "./process-runner";
import type { BoundaryExecutionResult, BoundaryFailureReason, CapabilityRequest } from "./types";
import { PathEscapeError, resolveWithinWorkspace } from "./workspace";

export * from "./types";
export { createWorkspace, cleanupWorkspace, resolveWithinWorkspace, PathEscapeError, runtimeRoot } from "./workspace";
export { checkNetworkAllowed, isNetworkEnforcementReal } from "./network-policy";
export { runCommand, isExecutableAllowed } from "./process-runner";

/**
 * `boundaryFailureToClassification` maps a boundary-specific failure onto
 * the SAME shared taxonomy `verification/classification.ts` already
 * defines, rather than inventing a second one (Section 6 of the sprint
 * brief).
 */
export function boundaryFailureToClassification(reason: BoundaryFailureReason | undefined): FailureClassification {
  switch (reason) {
    case "TIMEOUT":
    case "RESOURCE_EXHAUSTED":
      return "TRANSIENT";
    case "PATH_ESCAPE":
    case "EXECUTABLE_NOT_ALLOWED":
    case "NETWORK_NOT_ALLOWED":
      return "POLICY_DENIED";
    case "CANCELLED":
      return "UNKNOWN";
    case "BOUNDARY_CRASH":
      return "PERMANENT";
    default:
      return "UNKNOWN";
  }
}

function denied(requestId: string, reason: BoundaryFailureReason, message: string): BoundaryExecutionResult {
  const now = new Date().toISOString();
  return {
    requestId,
    ok: false,
    exitCode: null,
    stdout: "",
    stderr: "",
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    failureReason: reason,
    failureMessage: message,
  };
}

/**
 * The one entry point external callers (ultimately `missions/orchestrator.ts`'s
 * `handleToolRequest`, for the write/shell/network tool categories Phase 05
 * found ungoverned) should call once JARVIS's own policy gate has already
 * returned ALLOW. This function does NOT re-run policy — it enforces the
 * physical constraints (workspace containment, executable allowlist,
 * declared network policy, timeout) of a request that's already authorized.
 *
 * Every call is audited through the SAME append-only audit log
 * (`security/audit.ts`'s `recordAudit`) the rest of the codebase uses — no
 * second audit system. Secrets are never included: only the capability
 * name, requested scope shape (not raw arg values), decision, and outcome
 * are recorded.
 */
export async function executeCapability(request: CapabilityRequest): Promise<BoundaryExecutionResult> {
  const auditBase = {
    actorId: "system:hermes-boundary",
    resourceType: "boundary_capability",
    resourceId: request.id,
  };

  try {
    if (request.signal?.aborted) {
      const result = denied(request.id, "CANCELLED", "Capability request was already cancelled before execution began.");
      audit(auditBase, request, result);
      return result;
    }

    if (request.kind === "filesystem-write") {
      const result = await executeFilesystemWrite(request);
      audit(auditBase, request, result);
      return result;
    }

    if (request.kind === "shell-command") {
      const result = await executeShellCommand(request);
      audit(auditBase, request, result);
      return result;
    }

    if (request.kind === "network-request") {
      const result = executeNetworkGate(request);
      audit(auditBase, request, result);
      return result;
    }

    const result = denied(request.id, "BOUNDARY_CRASH", `Unknown capability kind.`);
    audit(auditBase, request, result);
    return result;
  } catch (err) {
    const result: BoundaryExecutionResult =
      err instanceof PathEscapeError
        ? denied(request.id, "PATH_ESCAPE", err.message)
        : denied(request.id, "BOUNDARY_CRASH", err instanceof Error ? err.message : String(err));
    audit(auditBase, request, result);
    return result;
  }
}

function audit(
  base: { actorId: string; resourceType: string; resourceId: string },
  request: CapabilityRequest,
  result: BoundaryExecutionResult
): void {
  recordAudit({
    actorId: base.actorId,
    action: result.ok ? "boundary.execute.allowed" : "boundary.execute.denied",
    resourceType: base.resourceType,
    resourceId: base.resourceId,
    result: result.ok ? "allowed" : "denied",
    reason: result.ok
      ? `capability=${request.capability} exitCode=${result.exitCode ?? "n/a"}`
      : `capability=${request.capability} failureReason=${result.failureReason ?? "unknown"}: ${result.failureMessage ?? ""}`,
  });
}

async function executeFilesystemWrite(request: CapabilityRequest): Promise<BoundaryExecutionResult> {
  const startedAt = new Date();
  if (request.filesystemPolicy.mode === "none") {
    return denied(request.id, "PATH_ESCAPE", "Filesystem policy is 'none' — no filesystem access permitted for this capability.");
  }
  if (request.filesystemPolicy.mode === "read-only") {
    return denied(request.id, "PATH_ESCAPE", "Filesystem policy is 'read-only' — writes are not permitted for this capability.");
  }

  const rawPath = String(request.args.path ?? "");
  const content = typeof request.args.content === "string" ? request.args.content : "";
  const resolvedPath = resolveWithinWorkspace(request.workspaceRoot, rawPath);

  await fsp.mkdir(pathDirname(resolvedPath), { recursive: true });
  await fsp.writeFile(resolvedPath, content, "utf8");

  const endedAt = new Date();
  return {
    requestId: request.id,
    ok: true,
    exitCode: 0,
    stdout: `Wrote ${content.length} bytes to ${resolvedPath}`,
    stderr: "",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
  };
}

function pathDirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx === -1 ? p : p.slice(0, idx);
}

async function executeShellCommand(request: CapabilityRequest): Promise<BoundaryExecutionResult> {
  const executable = String(request.args.executable ?? "");
  const args = Array.isArray(request.args.args) ? (request.args.args as unknown[]).map(String) : [];
  return runCommand({
    requestId: request.id,
    executable,
    args,
    cwd: request.workspaceRoot,
    processPolicy: request.processPolicy,
    limits: request.limits,
    signal: request.signal,
  });
}

/**
 * "network-request" here means a direct fetch performed BY the boundary
 * itself (no child process involved) — the one network sub-case this
 * implementation can actually enforce for real. See network-policy.ts's
 * module doc for why a shell-spawned process's own network I/O is NOT
 * covered by this or any other function in this module.
 */
function executeNetworkGate(request: CapabilityRequest): BoundaryExecutionResult {
  const host = String(request.args.host ?? "");
  const port = typeof request.args.port === "number" ? request.args.port : undefined;
  const protocol = request.args.protocol === "http" || request.args.protocol === "https" ? request.args.protocol : undefined;
  const check = checkNetworkAllowed(request.networkPolicy, { host, port, protocol });
  if (!check.allowed) {
    return denied(request.id, "NETWORK_NOT_ALLOWED", check.reason);
  }
  const now = new Date().toISOString();
  return {
    requestId: request.id,
    ok: true,
    exitCode: 0,
    stdout: check.reason,
    stderr: "",
    startedAt: now,
    endedAt: now,
    durationMs: 0,
  };
}
