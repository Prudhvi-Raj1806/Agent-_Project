import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/server/access/guard";
import { voiceStudioBaseUrl } from "@/server/voice/tts";

export const dynamic = "force-dynamic";

const MAX_VOICES = 100;
const LIST_TIMEOUT_MS = 1_500;

/**
 * The voice profiles Voice Studio has, for the Settings picker. When Voice
 * Studio isn't running, the list is empty and `available` is false.
 */
export async function GET(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied) return denied;

  const none = NextResponse.json({ available: false, voices: [] });
  const base = voiceStudioBaseUrl();
  if (!base) return none;

  try {
    const res = await fetch(`${base}/profiles`, { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    if (!res.ok) return none;
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return none;

    const voices = rows
      .flatMap((row) => {
        const record = row as { id?: unknown; name?: unknown };
        return typeof record.id === "string" && typeof record.name === "string"
          ? [{ id: record.id, name: record.name }]
          : [];
      })
      .slice(0, MAX_VOICES);
    return NextResponse.json({ available: true, voices });
  } catch {
    return none;
  }
}
