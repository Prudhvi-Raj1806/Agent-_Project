import { NextResponse } from "next/server";
import { requireAccess } from "@/server/access/guard";
import { getServiceController } from "@/server/services";
import { ServiceInputError } from "@/server/services/controller";

/** Starts, stops or restarts one known service. Only ids and actions from the fixed list are accepted. */
export async function POST(request: Request, ctx: RouteContext<"/api/services/[id]/[action]">) {
  const denied = requireAccess(request);
  if (denied) return denied;

  const { id, action } = await ctx.params;
  try {
    return NextResponse.json(await getServiceController().run(id, action));
  } catch (err) {
    if (err instanceof ServiceInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't do that." }, { status: 500 });
  }
}
