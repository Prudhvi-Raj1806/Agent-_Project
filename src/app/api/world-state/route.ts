import { NextResponse } from "next/server";
import { getWorldState } from "@/server/world-state/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const worldState = await getWorldState();
  return NextResponse.json(worldState);
}
