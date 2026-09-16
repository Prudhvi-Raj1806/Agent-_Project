import { NextResponse } from "next/server";
import { InvalidTransitionError, NotFoundError } from "@/server/missions/service";
import { resumeMission } from "@/server/missions/orchestrator";

export async function POST(_request: Request, ctx: RouteContext<"/api/missions/[id]/resume">) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ mission: resumeMission(id) });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof InvalidTransitionError) return NextResponse.json({ error: err.message }, { status: 409 });
    return NextResponse.json({ error: "Internal error resuming mission." }, { status: 500 });
  }
}
