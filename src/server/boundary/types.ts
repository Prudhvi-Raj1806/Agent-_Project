import type { RiskLevel } from "@/server/security/types";

/**
 * Production Sprint 08 Part I — External Hermes Execution Boundary.
 *
 * This module is downstream of an ALLOW verdict from
 * `security/tool-policy.ts` (via `tools/executor.ts`'s
 * `evaluateGovernedToolCall`). It does NOT replace or duplicate that
 * decision — it enforces what happens physically once JARVIS has already
 * decided a capability request may proceed. See JARVIS_CURRENT_STAGE.md's
 * "Production Sprint 08 — Part I" section for the full design rationale and
 * honest limitations.
 *
 * Lifecycle:
 *   Mission -> JARVIS Policy (tool-policy.ts) -> Hermes reasoning
 *     -> capability request -> JARVIS authorization (evaluateGovernedToolCall)
 *     -> ExecutionBoundary (this module) -> actual resource
 *     -> observation -> verification (verification/verifier.ts)
 */

/** What kind of physical side effect this capability request performs. Mirrors `tools/types.ts`'s `ToolSideEffect` vocabulary rather than inventing a parallel one. */
export type BoundaryCapabilityKind = "filesystem-write" | "shell-command" | "network-request";

/**
 * Filesystem policy for a capability request.
 *  - "workspace-only": all read/write paths must canonicalize to inside the
 *    assigned disposable workspace root. The only mode with any real
 *    enforcement in this implementation.
 *  - "read-only": like workspace-only, but write operations are rejected
 *    outright regardless of path.
 *  - "none": no filesystem access is permitted at all (e.g. a pure
 *    network-only or compute-only capability).
 */
export type FilesystemPolicyMode = "workspace-only" | "read-only" | "none";

export interface FilesystemPolicy {
  mode: FilesystemPolicyMode;
  /** Additional absolute paths outside the workspace that are explicitly permitted (rare; defaults to none). Each is still canonicalized and symlink-checked the same way as the workspace root. */
  extraAllowedPaths?: string[];
}

/** Process policy: which executables may be spawned, if any. An empty allowlist means no process may be spawned at all. */
export interface ProcessPolicy {
  allowedExecutables: string[];
  /** Extra environment variables to expose to the child process, on top of a minimal scrubbed base env. Never include secrets here — see audit note in process-runner.ts. */
  env?: Record<string, string>;
}

/**
 * Network policy. "none" is enforced (no capability that declares "none"
 * may open sockets through this boundary's own runner). "allowlist" is
 * documented and structurally validated here, but — see
 * JARVIS_CURRENT_STAGE.md — this process-level boundary CANNOT guarantee a
 * spawned child process, or Hermes's own out-of-process runtime, actually
 * honors it without an OS-level firewall/proxy in front of it. Treat
 * "allowlist" as an honest best-effort declaration, not a hard guarantee,
 * until that external enforcement point exists.
 */
export type NetworkPolicyMode = "none" | "allowlist";

export interface NetworkAllowlistEntry {
  host: string;
  port?: number;
  protocol?: "http" | "https";
}

export interface NetworkPolicy {
  mode: NetworkPolicyMode;
  allowlist?: NetworkAllowlistEntry[];
}

export interface ResourceLimits {
  timeoutMs: number;
  /** Best-effort; not enforced by this implementation beyond documenting the field (see JARVIS_CURRENT_STAGE.md — real memory/CPU caps need Windows Job Objects, not built this sprint). */
  maxMemoryMb?: number;
}

/** A capability request going through the external execution boundary. */
export interface CapabilityRequest {
  id: string;
  missionId: string;
  /** The Hermes-mediated tool/capability name this request represents (e.g. "write_file", "execute_command"). */
  capability: string;
  kind: BoundaryCapabilityKind;
  /** Free-form arguments for the capability (e.g. { path, content } for a write, { command, args } for a shell command). Never logged/audited raw if it may contain secrets — see audit.ts integration. */
  args: Record<string, unknown>;
  /** Root directory for this execution's disposable workspace. Assigned by `workspace.ts`, not the caller. */
  workspaceRoot: string;
  filesystemPolicy: FilesystemPolicy;
  processPolicy: ProcessPolicy;
  networkPolicy: NetworkPolicy;
  limits: ResourceLimits;
  /** Risk classification carried over from the policy decision that authorized this request — informational here, not re-evaluated. */
  risk: RiskLevel;
  /** For cancellation: aborting this signal must actually terminate the underlying process tree, not just stop awaiting it. */
  signal?: AbortSignal;
  /** Execution-identity correlation, reusing verification/execution-identity.ts's convention. */
  executionIdentityKey?: string;
}

export type BoundaryFailureReason =
  | "TIMEOUT"
  | "PATH_ESCAPE"
  | "EXECUTABLE_NOT_ALLOWED"
  | "NETWORK_NOT_ALLOWED"
  | "RESOURCE_EXHAUSTED"
  | "BOUNDARY_CRASH"
  | "CANCELLED";

export interface BoundaryExecutionResult {
  requestId: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  /** Set only on a non-ok result — see verification/classification.ts's FailureClassification for how this maps to the shared taxonomy. */
  failureReason?: BoundaryFailureReason;
  failureMessage?: string;
}
