import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_HEADER } from "@/server/access/guard";
import { evaluateAccess } from "@/server/access/gate";
import { recordAudit } from "@/server/security/audit";
import { getAllSettings, type SettingsShape } from "@/server/settings/store";

const SETTINGS_TTL_MS = 2_000;
let cached: { at: number; settings: SettingsShape } | null = null;

function currentSettings(): SettingsShape {
  const now = Date.now();
  if (!cached || now - cached.at > SETTINGS_TTL_MS) cached = { at: now, settings: getAllSettings() };
  return cached.settings;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Gate for the whole app (Next 16 "Proxy"). Every page and API request is
 * either approved here and stamped with `x-access-via`, or refused with 403.
 * Remote requests that change something are written to the audit log.
 */
export function proxy(request: NextRequest) {
  const settings = currentSettings();
  const decision = evaluateAccess({
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    tailscaleLogin: request.headers.get("tailscale-user-login"),
    remoteEnabled: settings["remote.enabled"],
    allowedLogins: settings["remote.allowedLogins"],
    tailnetHost: settings["remote.tailnetHost"],
  });

  if (!decision.allow) return new NextResponse("Forbidden", { status: 403 });

  if (decision.via === "tailscale" && !SAFE_METHODS.has(request.method)) {
    try {
      recordAudit({
        actorId: decision.login,
        action: "remote.request",
        resourceType: "http",
        resourceId: `${request.method} ${request.nextUrl.pathname}`,
        result: "allowed",
      });
    } catch {
      // Auditing must never block the request itself.
    }
  }

  // Overwrite, never trust, anything the client sent under this name.
  const headers = new Headers(request.headers);
  headers.set(ACCESS_HEADER, decision.via);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
