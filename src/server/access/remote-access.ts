import { getAllSettings, setSettings } from "@/server/settings/store";
import { listRemoteAudit, type RemoteAuditRow } from "./audit";
import { checkLanExposure } from "./exposure";
import { buildServeArgs, parseServeUrl, parseTailscaleStatus, runTailscale, SERVE_RESET_ARGS } from "./tailscale";

export interface RemoteAccessDeps {
  runTailscale: (args: string[]) => Promise<{ ok: boolean; output: string; installed?: boolean }>;
  checkLanExposure: typeof checkLanExposure;
}

export interface RemoteAccessState {
  enabled: boolean;
  allowedLogins: string[];
  tailnetHost: string;
  url: string | null;
  tailscale: { installed: boolean; running: boolean; loginName: string | null; dnsName: string | null };
  exposure: { exposed: boolean; address: string | null };
  recent: RemoteAuditRow[];
}

export type ServeAction = "enable" | "disable";

async function readStatus(deps: RemoteAccessDeps) {
  const result = await deps.runTailscale(["status", "--json"]);
  let parsed = parseTailscaleStatus(null);
  if (result.ok) {
    try {
      parsed = parseTailscaleStatus(JSON.parse(result.output));
    } catch {
      // Unparsable output reads as "not running".
    }
  }
  return { installed: result.installed ?? result.ok, ...parsed };
}

/** Everything the Remote access panel shows and does. Tailscale and the network probe are injected so it can be tested. */
export function createRemoteAccess(deps: RemoteAccessDeps) {
  return {
    async state(port: number): Promise<RemoteAccessState> {
      const settings = getAllSettings();
      const tailnetHost = settings["remote.tailnetHost"];
      return {
        enabled: settings["remote.enabled"],
        allowedLogins: settings["remote.allowedLogins"],
        tailnetHost,
        url: tailnetHost ? `https://${tailnetHost}/` : null,
        tailscale: await readStatus(deps),
        exposure: await deps.checkLanExposure(port),
        recent: listRemoteAudit(10),
      };
    },

    /** Throws if a value is invalid; nothing is stored in that case. */
    update(patch: { enabled?: boolean; allowedLogins?: string[] }): void {
      setSettings({
        ...(patch.enabled !== undefined ? { "remote.enabled": patch.enabled } : {}),
        ...(patch.allowedLogins !== undefined ? { "remote.allowedLogins": patch.allowedLogins } : {}),
      });
    },

    async serve(action: ServeAction, port: number): Promise<{ ok: boolean; output: string; url: string | null }> {
      if (action !== "enable" && action !== "disable") throw new Error(`Unknown action "${String(action)}".`);

      if (action === "disable") {
        const reset = await deps.runTailscale(SERVE_RESET_ARGS);
        return { ok: reset.ok, output: reset.output, url: null };
      }

      const served = await deps.runTailscale(buildServeArgs(port));
      if (!served.ok) return { ok: false, output: served.output, url: null };

      const status = await readStatus(deps);
      const url = parseServeUrl(served.output) ?? (status.dnsName ? `https://${status.dnsName}/` : null);
      const patch: Record<string, unknown> = {};
      if (status.dnsName) patch["remote.tailnetHost"] = status.dnsName;
      if (status.loginName && getAllSettings()["remote.allowedLogins"].length === 0) {
        patch["remote.allowedLogins"] = [status.loginName];
      }
      if (Object.keys(patch).length) setSettings(patch);
      return { ok: true, output: served.output, url };
    },
  };
}

export type RemoteAccess = ReturnType<typeof createRemoteAccess>;
export const realRemoteAccessDeps: RemoteAccessDeps = { runTailscale, checkLanExposure };
