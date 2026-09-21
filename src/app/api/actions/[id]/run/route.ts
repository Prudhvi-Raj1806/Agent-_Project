import { NextResponse } from "next/server";
import { runQuickAction } from "@/server/actions/service";

export async function POST(request: Request, ctx: RouteContext<"/api/actions/[id]/run">) {
  const { id } = await ctx.params;
  const token = request.headers.get("x-verify-token");
  const { status, ...result } = await runQuickAction(id, token);
  return NextResponse.json(result, { status });
}
