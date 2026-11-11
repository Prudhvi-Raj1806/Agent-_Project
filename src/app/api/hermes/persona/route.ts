import { NextResponse } from "next/server";
import { PERSONA_LIMIT, checkPersonaText } from "@/lib/persona";
import { requireAccess } from "@/server/access/guard";
import { HermesNotInstalledError, loadPersona, savePersona } from "@/server/hermes/persona";

/** Hermes's personality (its SOUL.md), in full, with the limit a save must fit. */
export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    return NextResponse.json({ ...(await loadPersona()), limit: PERSONA_LIMIT });
  } catch {
    return NextResponse.json({ error: "Couldn't read the personality file." }, { status: 500 });
  }
}

/**
 * Replaces the personality. The old file is backed up beside it first. No
 * gateway restart: Hermes reads SOUL.md when it builds a conversation's system
 * prompt, so the change applies to the next conversation.
 */
export async function PUT(request: Request) {
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

  let text: string;
  try {
    text = checkPersonaText((body as { text?: unknown }).text);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid personality." }, { status: 400 });
  }

  try {
    const { backupPath } = await savePersona(text);
    return NextResponse.json({ ok: true, text, backupPath });
  } catch (err) {
    if (err instanceof HermesNotInstalledError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Couldn't write the personality file." }, { status: 500 });
  }
}
