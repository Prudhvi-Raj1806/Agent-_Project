const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True only when a request was made to, and (if the browser says where it came
 * from) originated from, this machine. Routes that edit Hermes's config or
 * restart its process use this so a web page on another site can't drive them.
 */
export function isLocalRequest(headers: { get(name: string): string | null }): boolean {
  const host = headers.get("host");
  const hostname = host ? hostnameOf(host) : null;
  if (!hostname || !LOCAL_HOSTS.has(hostname)) return false;

  const origin = headers.get("origin");
  if (origin && origin !== "null") {
    const originHost = hostnameOf(origin);
    if (!originHost || !LOCAL_HOSTS.has(originHost)) return false;
  } else if (origin === "null") {
    return false;
  }
  return true;
}
