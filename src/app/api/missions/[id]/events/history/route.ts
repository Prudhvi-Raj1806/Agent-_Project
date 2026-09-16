import { NextResponse } from "next/server";
import { listEventsForMission } from "@/server/events/service";

/** JSON dump of a mission's event history — useful for testing/tooling without an SSE client. */
export async function GET(_request: Request, ctx: RouteContext<"/api/missions/[id]/events/history">) {
  const { id } = await ctx.params;
  return NextResponse.json({ events: listEventsForMission(id) });
}
