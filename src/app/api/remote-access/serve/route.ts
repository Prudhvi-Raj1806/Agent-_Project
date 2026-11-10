import { NextResponse } from "next/server";
import { getRemoteAccess } from "@/server/access";
import { requireAccess } from "@/server/access/guard";

/** Turns phone access (the Tailscale proxy to this server) on or off. Only the two fixed actions are accepted. */
export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;

  let action: unknown;
  try {
    action = ((await request.json()) as { action?: unknown })?.action;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (action !== "enable" && action !== "disable") {
    return NextResponse.json({ error: 'action must be "enable" or "disable".' }, { status: 400 });
  }

  const port = Number(new URL(request.url).port);
  return NextResponse.json(await getRemoteAccess().serve(action, Number.isInteger(port) && port > 0 ? port : 3000));
}
