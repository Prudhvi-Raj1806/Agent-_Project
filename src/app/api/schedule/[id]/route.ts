import { NextResponse } from "next/server";
import { removeScheduleItem } from "@/server/schedule/service";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/schedule/[id]">) {
  const { id } = await ctx.params;
  removeScheduleItem(id);
  return NextResponse.json({ ok: true });
}
