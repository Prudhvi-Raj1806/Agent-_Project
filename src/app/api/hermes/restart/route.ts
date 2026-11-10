import { NextResponse, type NextRequest } from "next/server";
import { restartHermesGateway } from "@/server/hermes/gateway";
import { requireAccess } from "@/server/access/guard";

/** Restarts the Hermes gateway without changing its config. */
export async function POST(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;
  try {
    const health = await restartHermesGateway();
    return NextResponse.json({ ok: health.healthy, health });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't restart the gateway." }, { status: 500 });
  }
}
