import { NextResponse } from "next/server";
import { ACTION_REGISTRY } from "@/server/actions/registry";
import { logger } from "@/server/logging/logger";
import { consumeVerificationToken } from "@/server/voice/passcode";

export async function POST(request: Request, ctx: RouteContext<"/api/actions/[id]/run">) {
  const { id } = await ctx.params;
  const action = ACTION_REGISTRY[id];
  if (!action) {
    return NextResponse.json({ ok: false, message: "Unknown action." }, { status: 404 });
  }

  if (action.risk === "risky") {
    const token = request.headers.get("x-verify-token");
    if (!consumeVerificationToken(token)) {
      logger.warn("action.run.blocked", { id, reason: "missing or invalid verification token" });
      return NextResponse.json(
        { ok: false, message: "This action requires voice verification first." },
        { status: 403 }
      );
    }
  }

  const result = await action.run();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
