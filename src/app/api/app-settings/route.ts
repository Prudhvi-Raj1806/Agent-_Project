import { NextResponse } from "next/server";
import { getAllSettings, setSettings, type SettingsShape } from "@/server/settings/store";

/** All dashboard settings, with defaults filled in. */
export async function GET(_request: Request) {
  return NextResponse.json(getAllSettings());
}

/** Applies a partial update; every value is validated and a bad one stores nothing. */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  try {
    return NextResponse.json(setSettings(body as Partial<SettingsShape>));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid settings." }, { status: 400 });
  }
}
