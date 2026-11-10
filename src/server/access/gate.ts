/**
 * The one decision every request goes through. Pure: it only looks at the
 * values it is given, so it can be tested exhaustively.
 *
 * Two ways in:
 *  - the owner at this PC: a loopback Host and no Tailscale header;
 *  - the owner's phone: a request that arrived through `tailscale serve`
 *    (identified by its Tailscale-User-Login header), for the tailnet host,
 *    from a listed login, while remote access is switched on.
 *
 * A Tailscale header always selects the remote rules. A request that claims
 * both "localhost" and a Tailscale identity is never treated as local.
 */

export interface AccessInput {
  host: string | null;
  origin: string | null;
  tailscaleLogin: string | null;
  remoteEnabled: boolean;
  allowedLogins: string[];
  tailnetHost: string;
}

export type AccessDecision =
  | { allow: true; via: "local" }
  | { allow: true; via: "tailscale"; login: string }
  | { allow: false; reason: string };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when there is no Origin, or its hostname passes `isAllowed`. "null" (sandboxed pages) never passes. */
function originAllowed(origin: string | null, isAllowed: (hostname: string) => boolean): boolean {
  if (origin === null || origin === "") return true;
  if (origin === "null") return false;
  const hostname = hostnameOf(origin);
  return hostname !== null && isAllowed(hostname);
}

function evaluateLocal(input: AccessInput): AccessDecision {
  const hostname = hostnameOf(input.host);
  if (!hostname || !LOOPBACK_HOSTS.has(hostname)) return { allow: false, reason: "Host is not this machine." };
  if (!originAllowed(input.origin, (h) => LOOPBACK_HOSTS.has(h))) {
    return { allow: false, reason: "Request came from another site." };
  }
  // A page served by another local app (same machine, different port or loopback name) is still another site.
  if (input.origin && new URL(input.origin).host.toLowerCase() !== (input.host ?? "").toLowerCase()) {
    return { allow: false, reason: "Request came from another local app." };
  }
  return { allow: true, via: "local" };
}

function evaluateRemote(input: AccessInput, login: string): AccessDecision {
  if (!input.remoteEnabled) return { allow: false, reason: "Remote access is off." };
  const allowed = input.allowedLogins.map((l) => l.toLowerCase());
  if (!allowed.includes(login.toLowerCase())) return { allow: false, reason: "This login isn't allowed." };

  const tailnetHost = input.tailnetHost.toLowerCase();
  if (!tailnetHost) return { allow: false, reason: "Phone access isn't set up." };
  if (hostnameOf(input.host) !== tailnetHost) return { allow: false, reason: "Host doesn't match the tailnet name." };
  if (!originAllowed(input.origin, (h) => h === tailnetHost)) {
    return { allow: false, reason: "Request came from another site." };
  }
  return { allow: true, via: "tailscale", login };
}

export function evaluateAccess(input: AccessInput): AccessDecision {
  const login = input.tailscaleLogin?.trim();
  return login ? evaluateRemote(input, login) : evaluateLocal(input);
}
