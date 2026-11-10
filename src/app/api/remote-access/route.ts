import { NextResponse } from "next/server";
import { getRemoteAccess } from "@/server/access";
import { requireAccess } from "@/server/access/guard";

function portOf(request: Request): number {
  const port = Number(new URL(request.url).port);
  return Number.isInteger(port) && port > 0 ? port : 3000;
}

/** Phone access state: switch, allowed logins, Tailscale status, exposure warning and recent remote changes. */
export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  return NextResponse.json(await getRemoteAccess().state(portOf(request)));
}

/** Changes the remote switch and/or the allowed logins; an invalid value stores nothing. */
export async function PUT(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const { enabled, allowedLogins } = body as { enabled?: unknown; allowedLogins?: unknown };
  try {
    const access = getRemoteAccess();
    access.update({ enabled: enabled as boolean | undefined, allowedLogins: allowedLogins as string[] | undefined });
    return NextResponse.json(await access.state(portOf(request)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid value." }, { status: 400 });
  }
}
