import { NextResponse } from "next/server";
import { InvalidTransitionError, NotFoundError } from "@/server/missions/service";
import { pauseMission } from "@/server/missions/orchestrator";

export async function POST(_request: Request, ctx: RouteContext<"/api/missions/[id]/pause">) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ mission: pauseMission(id) });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof InvalidTransitionError) return NextResponse.json({ error: err.message }, { status: 409 });
    return NextResponse.json({ error: "Internal error pausing mission." }, { status: 500 });
  }
}
