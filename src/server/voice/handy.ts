import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Bridge to Handy (https://handy.computer), the local push-to-talk dictation
 * app. Handy has no transcript API — it pastes what you say into whatever
 * field is focused — so the only thing Jarvis can do is ask a *running*
 * instance to start/stop listening, via Handy's own remote-control flags.
 * The transcription itself lands in the focused box with no help from here.
 */

export type HandyAction = "toggle" | "cancel";

const FLAGS: Record<HandyAction, string> = {
  toggle: "--toggle-transcription",
  cancel: "--cancel",
};

export interface HandyDeps {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  exists: (p: string) => boolean;
  isProcessRunning: (imageName: string) => Promise<boolean>;
  spawnDetached: (exe: string, args: string[]) => Promise<void>;
}

function processRunning(platform: NodeJS.Platform, imageName: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (platform === "win32") {
      execFile("tasklist", ["/FI", `IMAGENAME eq ${imageName}`, "/NH"], { windowsHide: true }, (err, stdout) => {
        resolve(!err && stdout.toLowerCase().includes(imageName.toLowerCase()));
      });
    } else {
      execFile("pgrep", ["-x", imageName.replace(/\.exe$/i, "")], (err) => resolve(!err));
    }
  });
}

export const defaultHandyDeps: HandyDeps = {
  platform: process.platform,
  env: process.env,
  exists: existsSync,
  isProcessRunning: (imageName) => processRunning(process.platform, imageName),
  spawnDetached: (exe, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: true });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    }),
};

/** HANDY_PATH wins; otherwise the default per-user Windows install. Null if nothing is there. */
export function resolveHandyPath(deps: HandyDeps = defaultHandyDeps): string | null {
  const configured = deps.env.HANDY_PATH?.trim();
  const candidate =
    configured ||
    (deps.platform === "win32" && deps.env.LOCALAPPDATA
      ? path.win32.join(deps.env.LOCALAPPDATA, "Handy", "handy.exe")
      : null);
  return candidate && deps.exists(candidate) ? candidate : null;
}

export async function handyStatus(deps: HandyDeps = defaultHandyDeps): Promise<{ installed: boolean; running: boolean }> {
  const exe = resolveHandyPath(deps);
  if (!exe) return { installed: false, running: false };
  const image = deps.platform === "win32" ? "handy.exe" : "handy";
  return { installed: true, running: await deps.isProcessRunning(image) };
}

export type RunHandyResult =
  | { ok: true }
  | { ok: false; reason: "invalid-action" | "not-installed" | "not-running" | "failed" };

/**
 * Sends a fixed remote-control flag to a running Handy. Never launches Handy
 * itself (a fresh instance can't toggle anything) and never forwards
 * caller-supplied arguments.
 */
export async function runHandy(action: HandyAction, deps: HandyDeps = defaultHandyDeps): Promise<RunHandyResult> {
  const flag = FLAGS[action];
  if (!flag) return { ok: false, reason: "invalid-action" };

  const exe = resolveHandyPath(deps);
  if (!exe) return { ok: false, reason: "not-installed" };

  const status = await handyStatus(deps);
  if (!status.running) return { ok: false, reason: "not-running" };

  try {
    await deps.spawnDetached(exe, [flag]);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * Guards the routes that act on the local machine: the request must be
 * addressed to a loopback host and must not come from another site. Stops a
 * random web page from poking the user's dictation app through their browser.
 */
export function isLocalOriginRequest(headers: Headers): boolean {
  const host = headers.get("host") ?? "";
  if (!LOOPBACK_HOST.test(host)) return false;

  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;

  const origin = headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}
