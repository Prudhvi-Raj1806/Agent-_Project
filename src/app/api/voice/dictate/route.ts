import { NextResponse, type NextRequest } from "next/server";
import { isLocalOriginRequest, runHandy, type HandyAction } from "@/server/voice/handy";

const REASON_TEXT: Record<string, { status: number; error: string }> = {
  "not-installed": { status: 404, error: "Handy isn't installed." },
  "not-running": { status: 409, error: "Handy isn't running — open it first." },
  "invalid-action": { status: 400, error: "`action` must be \"toggle\" or \"cancel\"." },
  failed: { status: 500, error: "Couldn't reach Handy." },
};

/**
 * Asks the running Handy app to start/stop listening. Handy pastes the
 * transcription into whatever field is focused — this route never sees the text.
 */
export async function POST(request: NextRequest) {
  if (!isLocalOriginRequest(request.headers)) {
    return NextResponse.json({ error: "Dictation can only be controlled from this machine." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action as HandyAction;

  const result = await runHandy(action);
  if (!result.ok) {
    const { status, error } = REASON_TEXT[result.reason];
    return NextResponse.json({ error, reason: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
