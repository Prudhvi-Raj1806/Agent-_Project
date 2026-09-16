import { NextResponse } from "next/server";
import { getMission } from "@/server/missions/service";

export async function GET(_request: Request, ctx: RouteContext<"/api/missions/[id]">) {
  const { id } = await ctx.params;
  const mission = getMission(id);
  if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });
  return NextResponse.json({ mission });
}
