import { NextResponse } from "next/server";
import { requireAccess, requireLocal } from "@/server/access/guard";
import { getAllSettings, setSettings, type SettingsShape } from "@/server/settings/store";

/** All dashboard settings, with defaults filled in. */
export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  return NextResponse.json(getAllSettings());
}

/** Applies a partial update; every value is validated and a bad one stores nothing. */
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
  // Who may reach this server is decided at the PC, never from the phone being let in.
  if (Object.keys(body).some((key) => key.startsWith("remote."))) {
    const notLocal = requireLocal(request);
    if (notLocal) return notLocal;
  }
  try {
    return NextResponse.json(setSettings(body as Partial<SettingsShape>));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid settings." }, { status: 400 });
  }
}
