import { NextResponse, type NextRequest } from "next/server";
import { resolveToolApproval } from "@/server/missions/orchestrator";
import { NotFoundError } from "@/server/missions/service";

/** The owner's ALLOW/DENY answer to a `security.approval_required` event. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/missions/[id]/tool-approvals/[toolCallId]">
) {
  const { id, toolCallId } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { approved, reason } = (body ?? {}) as { approved?: unknown; reason?: unknown };
  if (typeof approved !== "boolean") {
    return NextResponse.json({ error: "`approved` must be a boolean." }, { status: 400 });
  }

  try {
    resolveToolApproval(id, toolCallId, approved, typeof reason === "string" ? reason : undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    return NextResponse.json({ error: "Internal error resolving tool approval." }, { status: 500 });
  }
}
