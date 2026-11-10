import { NextResponse } from "next/server";
import { getRemoteAccess } from "@/server/access";
import { requireLocal } from "@/server/access/guard";
import { ExposedServerError } from "@/server/access/remote-access";

/** Turns phone access (the Tailscale proxy to this server) on or off. Only the two fixed actions are accepted. */
export async function POST(request: Request) {
  const denied = requireLocal(request);
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
  try {
    return NextResponse.json(await getRemoteAccess().serve(action, Number.isInteger(port) && port > 0 ? port : 3000));
  } catch (err) {
    if (err instanceof ExposedServerError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
