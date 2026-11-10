import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../../proxy";
import { getDb, resetDbForTests } from "@/server/db/client";
import { setSettings } from "@/server/settings/store";
import { ACCESS_HEADER } from "./guard";

const state = vi.hoisted(() => ({ failReads: false }));

vi.mock("@/server/settings/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/settings/store")>();
  return {
    ...actual,
    getAllSettings: () => {
      if (state.failReads) throw new Error("SQLITE_BUSY");
      return actual.getAllSettings();
    },
  };
});

const TAILNET = "pc.tail1234.ts.net";
const STAMP_ECHO = `x-middleware-request-${ACCESS_HEADER}`;

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost:3000${path}`, { method: init.method ?? "GET", headers: init.headers });
}

function auditCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'remote.request'`).get() as { n: number }).n;
}

const phone = { host: TAILNET, "tailscale-user-login": "me@x.com" };
const enableRemote = () =>
  setSettings({ "remote.enabled": true, "remote.allowedLogins": ["me@x.com"], "remote.tailnetHost": TAILNET });

describe("proxy", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
    state.failReads = false;
  });

  it("stamps a local request as local", () => {
    const res = proxy(request("/api/x", { headers: { host: "localhost:3000" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get(STAMP_ECHO)).toBe("local");
  });

  it("overwrites a client-sent access header instead of trusting it", () => {
    const res = proxy(request("/api/x", { headers: { host: "localhost:3000", [ACCESS_HEADER]: "tailscale" } }));
    expect(res.headers.get(STAMP_ECHO)).toBe("local");
  });

  it("refuses a forged local stamp sent with a Tailscale header while remote access is off", () => {
    const res = proxy(
      request("/api/x", { headers: { host: "localhost:3000", [ACCESS_HEADER]: "local", "tailscale-user-login": "attacker@x.com" } }),
    );
    expect(res.status).toBe(403);
  });

  it("allows a listed login on the tailnet host and stamps it as tailscale", () => {
    enableRemote();
    const res = proxy(request("/api/x", { headers: phone }));
    expect(res.status).toBe(200);
    expect(res.headers.get(STAMP_ECHO)).toBe("tailscale");
  });

  it("applies a settings change on the very next request, with no stale window", () => {
    enableRemote();
    expect(proxy(request("/api/x", { headers: phone })).status).toBe(200);
    setSettings({ "remote.enabled": false });
    expect(proxy(request("/api/x", { headers: phone })).status).toBe(403);
  });

  it("writes one audit row for a remote request that changes something, and none for a read", () => {
    enableRemote();
    proxy(request("/api/x", { headers: phone }));
    expect(auditCount()).toBe(0);
    proxy(request("/api/x", { method: "POST", headers: phone }));
    expect(auditCount()).toBe(1);
  });

  it("keeps the local owner working, and refuses remote, when the settings can't be read", () => {
    state.failReads = true;
    expect(proxy(request("/api/x", { headers: { host: "localhost:3000" } })).status).toBe(200);
    expect(proxy(request("/api/x", { headers: phone })).status).toBe(403);
  });
});
