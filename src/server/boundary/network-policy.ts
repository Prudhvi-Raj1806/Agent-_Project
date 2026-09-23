import type { NetworkAllowlistEntry, NetworkPolicy } from "./types";

/**
 * Network policy check — HONESTLY SCOPED.
 *
 * What this actually does: validates a requested {host, port, protocol}
 * against a declared allowlist, structurally, so any code path in this
 * boundary that is ABOUT to make an outbound request on the boundary's own
 * behalf (not a spawned child process's own sockets) can consult it.
 *
 * What this does NOT do (EXTERNAL LIMITATION, not fixed this sprint): if a
 * capability request results in an arbitrary child process being spawned
 * (e.g. a shell command that itself calls `curl` or opens its own sockets),
 * this module has no way to intercept, observe, or block that process's
 * network I/O. Enforcing that would require one of:
 *   - an OS-level firewall/WFP rule scoped to the child process's PID
 *     (Windows Filtering Platform via a native addon or `netsh advfirewall`
 *     rules keyed to the process), or
 *   - routing the child process through a mandatory HTTP(S) proxy with
 *     `HTTP_PROXY`/`HTTPS_PROXY` env vars pointing at a local allowlisting
 *     proxy this boundary controls, and no other route to the internet
 *     (still bypassable by a process that ignores those env vars and opens
 *     raw sockets), or
 *   - full network namespace isolation, which Windows does not expose to a
 *     plain Node child_process the way Linux network namespaces do.
 * None of these were built this sprint — they are meaningfully sized
 * infrastructure, explicitly out of this sprint's "no Docker/no heavy
 * infra" scope. Recommendation: if network isolation for shell-spawned
 * processes becomes a real requirement, the concrete next step is a local
 * allowlisting HTTP(S) proxy (a few hundred lines, no new dependency
 * beyond a proxy library) combined with `HTTP_PROXY`/`HTTPS_PROXY`/
 * `NO_PROXY` env injection AND an outbound Windows Firewall rule blocking
 * direct egress for the boundary's spawned processes — proxy alone is not
 * a guarantee, only the firewall rule closes the "ignores env vars" case.
 *
 * Until then, `mode: "allowlist"` on a `network-request` capability kind
 * (where THIS module itself performs the fetch, e.g. a future direct HTTP
 * capability with no child process involved) is real and enforced by
 * `checkNetworkAllowed` below. `mode: "allowlist"` on a `shell-command`
 * capability that might reach the network internally is NOT enforced —
 * callers must not claim it is.
 */

export interface NetworkCheckResult {
  allowed: boolean;
  reason: string;
}

export function checkNetworkAllowed(policy: NetworkPolicy, requested: NetworkAllowlistEntry): NetworkCheckResult {
  if (policy.mode === "none") {
    return { allowed: false, reason: "Network policy is 'none' — no outbound network access permitted for this capability." };
  }
  const allowlist = policy.allowlist ?? [];
  const match = allowlist.find(
    (entry) =>
      entry.host.toLowerCase() === requested.host.toLowerCase() &&
      (entry.port == null || requested.port == null || entry.port === requested.port) &&
      (entry.protocol == null || requested.protocol == null || entry.protocol === requested.protocol)
  );
  if (!match) {
    return {
      allowed: false,
      reason: `Host "${requested.host}"${requested.port ? `:${requested.port}` : ""} is not in the declared network allowlist.`,
    };
  }
  return { allowed: true, reason: `Host "${requested.host}" matched an explicit allowlist entry.` };
}

/** Whether a capability kind's network policy is real (enforced by this module directly) vs. an honest best-effort declaration only. See module doc above. */
export function isNetworkEnforcementReal(kind: "direct-fetch" | "child-process"): boolean {
  return kind === "direct-fetch";
}
