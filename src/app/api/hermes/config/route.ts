import { NextResponse, type NextRequest } from "next/server";
import {
  applyModelChoice,
  loadHermesConfigText,
  readModelChoices,
  readModelSelection,
  saveHermesConfigText,
} from "@/server/hermes/config";
import { getHermesAdapter } from "@/server/hermes/factory";
import { restartHermesGateway } from "@/server/hermes/gateway";
import { requireAccess } from "@/server/access/guard";

function describeUrl(): string | null {
  const raw = process.env.HERMES_AGENT_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Gateway status plus which provider/model Hermes is set to and what it can be switched to. Never includes keys. */
export async function GET(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  const adapter = getHermesAdapter();
  const health = await adapter.checkHealth();
  const status = { mode: adapter.mode, url: describeUrl(), ...health };

  try {
    const text = await loadHermesConfigText();
    return NextResponse.json({ status, current: readModelSelection(text), choices: readModelChoices(text), configError: null });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Couldn't read Hermes's config.";
    return NextResponse.json({ status, current: null, choices: [], configError: reason });
  }
}

/** Switches Hermes to a configured provider/model and restarts its gateway so the change takes effect. */
export async function PUT(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const { provider, model } = (body ?? {}) as { provider?: unknown; model?: unknown };
  if (typeof provider !== "string" || typeof model !== "string") {
    return NextResponse.json({ error: "`provider` and `model` must be strings." }, { status: 400 });
  }

  let updated: string;
  try {
    updated = applyModelChoice(await loadHermesConfigText(), { provider, model });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid choice." }, { status: 400 });
  }

  try {
    const { backupPath } = await saveHermesConfigText(updated);
    try {
      const health = await restartHermesGateway();
      return NextResponse.json({ ok: true, current: readModelSelection(updated), health, backupPath, restartError: null });
    } catch (err) {
      return NextResponse.json({
        ok: true,
        current: readModelSelection(updated),
        health: null,
        backupPath,
        restartError: err instanceof Error ? err.message : "Couldn't restart the gateway.",
      });
    }
  } catch {
    return NextResponse.json({ error: "Couldn't write Hermes's config." }, { status: 500 });
  }
}
