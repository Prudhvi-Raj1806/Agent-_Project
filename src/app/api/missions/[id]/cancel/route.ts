import { NextResponse } from "next/server";
import { InvalidTransitionError, NotFoundError } from "@/server/missions/service";
import { cancelMission } from "@/server/missions/orchestrator";

export async function POST(_request: Request, ctx: RouteContext<"/api/missions/[id]/cancel">) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ mission: cancelMission(id) });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof InvalidTransitionError) return NextResponse.json({ error: err.message }, { status: 409 });
    return NextResponse.json({ error: "Internal error cancelling mission." }, { status: 500 });
  }
}
