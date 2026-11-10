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
