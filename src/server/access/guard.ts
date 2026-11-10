import { NextResponse } from "next/server";

/** Set by src/proxy.ts on requests it approved; any client-sent value is overwritten there. */
export const ACCESS_HEADER = "x-access-via";

/**
 * Second layer inside route handlers: refuse any request the proxy did not
 * stamp, so a gap in the proxy's matcher can never expose a route.
 * Returns null when the request may proceed.
 */
export function requireAccess(request: Request): NextResponse | null {
  const via = request.headers.get(ACCESS_HEADER);
  if (via === "local" || via === "tailscale") return null;
  return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

/**
 * For routes that change who may reach this server (remote switch, allowed
 * logins, publishing to the tailnet): only the owner at the PC, never a phone.
 */
export function requireLocal(request: Request): NextResponse | null {
  if (request.headers.get(ACCESS_HEADER) === "local") return null;
  return NextResponse.json({ error: "This can only be changed on the PC itself." }, { status: 403 });
}
