import { NextResponse } from "next/server";
import { requireAccess } from "@/server/access/guard";
import { handleRequest } from "@/server/brain";
import { cleanHistory } from "@/server/brain/chat";
import { getBrainStatus } from "@/server/brain/status";
import { logger } from "@/server/logging/logger";

const MAX_TEXT_LENGTH = 2_000;

/** Whether the mini brain is on, which model it uses, and whether that model is ready. */
export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await getBrainStatus());
  } catch {
    return NextResponse.json({ error: "Couldn't read the mini brain's status." }, { status: 500 });
  }
}

/**
 * One typed or spoken request for the mini brain. It answers itself, runs a
 * local skill, or hands the request to Hermes; the response says which.
 */
export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { text, history } = body as { text?: unknown; history?: unknown };
  if (typeof text !== "string" || text.trim() === "") {
    return NextResponse.json({ error: "`text` is required and must be non-empty text." }, { status: 400 });
  }
  if (text.trim().length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "A request can be at most 2,000 characters." }, { status: 400 });
  }

  let cleaned;
  try {
    cleaned = cleanHistory(history);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid history." }, { status: 400 });
  }

  try {
    return NextResponse.json(await handleRequest({ text: text.trim(), history: cleaned }));
  } catch (err) {
    logger.error("api.brain", { error: String(err) });
    return NextResponse.json({ error: "The mini brain hit an error." }, { status: 500 });
  }
}
