import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface TailscaleStatus {
  running: boolean;
  loginName: string | null;
  dnsName: string | null;
}

/** Reads what the dashboard needs from `tailscale status --json`; tolerant of any missing field. */
export function parseTailscaleStatus(json: unknown): TailscaleStatus {
  const empty: TailscaleStatus = { running: false, loginName: null, dnsName: null };
  if (!json || typeof json !== "object") return empty;
  const data = json as {
    BackendState?: unknown;
    Self?: { DNSName?: unknown; UserID?: unknown };
    User?: Record<string, { LoginName?: unknown }>;
  };
  const dns = typeof data.Self?.DNSName === "string" ? data.Self.DNSName.replace(/\.$/, "") : "";
  const userId = data.Self?.UserID;
  const login = userId !== undefined ? data.User?.[String(userId)]?.LoginName : undefined;
  return {
    running: data.BackendState === "Running",
    loginName: typeof login === "string" && login ? login : null,
    dnsName: dns || null,
  };
}

/** Publishes the local server to the owner's tailnet only, as HTTPS, in the background. */
export function buildServeArgs(port: number): string[] {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port.");
  return ["serve", "--bg", "--https=443", `http://127.0.0.1:${port}`];
}

export const SERVE_RESET_ARGS = ["serve", "reset"];

/** The tailnet URL in `tailscale serve` output, if any. */
export function parseServeUrl(output: string): string | null {
  const match = /https:\/\/[a-z0-9.-]+\.ts\.net\/?/i.exec(output);
  return match ? match[0] : null;
}

const WINDOWS_EXE = "C:\\Program Files\\Tailscale\\tailscale.exe";

/** Runs the Tailscale CLI with fixed arguments. Never throws; failures come back as `ok: false` with the CLI's own text. */
export async function runTailscale(args: string[]): Promise<{ ok: boolean; output: string; installed?: boolean }> {
  for (const file of [WINDOWS_EXE, "tailscale"]) {
    try {
      const { stdout, stderr } = await run(file, args, { windowsHide: true, timeout: 20_000 });
      return { ok: true, output: `${stdout}${stderr}`.trim(), installed: true };
    } catch (err) {
      const failure = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
      if (failure.code === "ENOENT") continue;
      return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim() || failure.message, installed: true };
    }
  }
  return { ok: false, output: "Tailscale isn't installed on this PC.", installed: false };
}
