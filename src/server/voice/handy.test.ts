import { describe, expect, it, vi } from "vitest";
import { handyStatus, isLocalOriginRequest, resolveHandyPath, runHandy, type HandyDeps } from "./handy";

function deps(overrides: Partial<HandyDeps> = {}): HandyDeps {
  return {
    platform: "win32",
    env: { LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local" },
    exists: () => true,
    isProcessRunning: async () => true,
    spawnDetached: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("resolveHandyPath", () => {
  it("prefers HANDY_PATH, then the default per-user install", () => {
    expect(resolveHandyPath(deps({ env: { HANDY_PATH: "D:\\apps\\handy.exe" } }))).toBe("D:\\apps\\handy.exe");
    expect(resolveHandyPath(deps())).toBe("C:\\Users\\Test\\AppData\\Local\\Handy\\handy.exe");
  });

  it("returns null when nothing exists at the resolved path", () => {
    expect(resolveHandyPath(deps({ exists: () => false }))).toBeNull();
  });
});

describe("handyStatus", () => {
  it("reports installed + running separately", async () => {
    expect(await handyStatus(deps())).toEqual({ installed: true, running: true });
    expect(await handyStatus(deps({ isProcessRunning: async () => false }))).toEqual({
      installed: true,
      running: false,
    });
    expect(await handyStatus(deps({ exists: () => false }))).toEqual({ installed: false, running: false });
  });
});

describe("runHandy", () => {
  it("sends only the fixed remote-control flags to the running instance", async () => {
    const d = deps();
    expect(await runHandy("toggle", d)).toEqual({ ok: true });
    expect(await runHandy("cancel", d)).toEqual({ ok: true });
    const calls = (d.spawnDetached as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][1]).toEqual(["--toggle-transcription"]);
    expect(calls[1][1]).toEqual(["--cancel"]);
  });

  it("does not launch Handy when it isn't already running", async () => {
    const d = deps({ isProcessRunning: async () => false });
    const result = await runHandy("toggle", d);
    expect(result).toMatchObject({ ok: false, reason: "not-running" });
    expect(d.spawnDetached).not.toHaveBeenCalled();
  });

  it("reports a missing install and a failed spawn plainly", async () => {
    expect(await runHandy("toggle", deps({ exists: () => false }))).toMatchObject({ ok: false, reason: "not-installed" });
    const failing = deps({
      spawnDetached: vi.fn(async () => {
        throw new Error("EACCES");
      }),
    });
    expect(await runHandy("toggle", failing)).toMatchObject({ ok: false, reason: "failed" });
  });

  it("rejects any action that isn't toggle or cancel", async () => {
    // @ts-expect-error — deliberately passing an invalid action
    expect(await runHandy("--import=evil", deps())).toMatchObject({ ok: false, reason: "invalid-action" });
  });
});

describe("isLocalOriginRequest", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("accepts same-origin loopback requests", () => {
    expect(isLocalOriginRequest(h({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
    expect(isLocalOriginRequest(h({ host: "127.0.0.1:3000" }))).toBe(true);
  });

  it("rejects cross-site and non-loopback requests", () => {
    expect(isLocalOriginRequest(h({ host: "localhost:3000", origin: "https://evil.example" }))).toBe(false);
    expect(isLocalOriginRequest(h({ host: "192.168.0.5:3000" }))).toBe(false);
    expect(isLocalOriginRequest(h({ host: "localhost:3000", "sec-fetch-site": "cross-site" }))).toBe(false);
  });
});
