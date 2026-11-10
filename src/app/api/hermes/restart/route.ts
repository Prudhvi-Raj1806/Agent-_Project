import { NextResponse, type NextRequest } from "next/server";
import { restartHermesGateway } from "@/server/hermes/gateway";
import { isLocalRequest } from "@/server/hermes/local-request";

/** Restarts the Hermes gateway without changing its config. */
export async function POST(request: NextRequest) {
  if (!isLocalRequest(request.headers)) return NextResponse.json({ error: "Local requests only." }, { status: 403 });
  try {
    const health = await restartHermesGateway();
    return NextResponse.json({ ok: health.healthy, health });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't restart the gateway." }, { status: 500 });
  }
}
