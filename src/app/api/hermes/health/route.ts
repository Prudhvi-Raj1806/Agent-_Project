import { NextResponse } from "next/server";
import { getHermesAdapter } from "@/server/hermes/factory";

export async function GET() {
  const adapter = getHermesAdapter();
  const health = await adapter.checkHealth();
  return NextResponse.json({ mode: adapter.mode, ...health });
}
