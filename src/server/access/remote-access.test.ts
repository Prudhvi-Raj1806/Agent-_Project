import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { recordAudit } from "@/server/security/audit";
import { getSetting } from "@/server/settings/store";
import { listRemoteAudit } from "./audit";
import { createRemoteAccess } from "./remote-access";

const statusJson = JSON.stringify({
  BackendState: "Running",
  Self: { DNSName: "pc.tail1234.ts.net.", UserID: 7 },
  User: { "7": { LoginName: "me@example.com" } },
});

function deps(overrides: { serveOk?: boolean; serveOutput?: string } = {}) {
  const calls: string[][] = [];
  return {
    calls,
    deps: {
      runTailscale: async (args: string[]) => {
        calls.push(args);
        if (args[0] === "status") return { ok: true, output: statusJson };
        return { ok: overrides.serveOk ?? true, output: overrides.serveOutput ?? "https://pc.tail1234.ts.net/\n" };
      },
      checkLanExposure: async () => ({ exposed: false, address: "192.168.0.5" }),
    },
  };
}

describe("remote access", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("reports the current state with no URL before phone access is set up", async () => {
    const { deps: d } = deps();
    const state = await createRemoteAccess(d).state(3000);
    expect(state.enabled).toBe(false);
    expect(state.url).toBeNull();
    expect(state.tailscale).toEqual({ installed: true, running: true, loginName: "me@example.com", dnsName: "pc.tail1234.ts.net" });
    expect(state.exposure).toEqual({ exposed: false, address: "192.168.0.5" });
  });

  it("update stores the switch and the allowed logins", async () => {
    const { deps: d } = deps();
    createRemoteAccess(d).update({ enabled: true, allowedLogins: ["Me@Example.com"] });
    expect(getSetting("remote.enabled")).toBe(true);
    expect(getSetting("remote.allowedLogins")).toEqual(["me@example.com"]);
  });

  it("update rejects an invalid value and stores nothing", async () => {
    const { deps: d } = deps();
    expect(() => createRemoteAccess(d).update({ enabled: "yes" as never })).toThrow();
    expect(getSetting("remote.enabled")).toBe(false);
  });

  it("enabling phone access serves the port, stores the tailnet host and the owner's login", async () => {
    const { deps: d, calls } = deps();
    const result = await createRemoteAccess(d).serve("enable", 3000);
    expect(calls).toContainEqual(["serve", "--bg", "--https=443", "http://127.0.0.1:3000"]);
    expect(result).toEqual({ ok: true, output: "https://pc.tail1234.ts.net/\n", url: "https://pc.tail1234.ts.net/" });
    expect(getSetting("remote.tailnetHost")).toBe("pc.tail1234.ts.net");
    expect(getSetting("remote.allowedLogins")).toEqual(["me@example.com"]);
    expect(getSetting("remote.enabled")).toBe(false);
  });

  it("enabling keeps logins the owner already chose", async () => {
    const { deps: d } = deps();
    const access = createRemoteAccess(d);
    access.update({ allowedLogins: ["other@example.com"] });
    await access.serve("enable", 3000);
    expect(getSetting("remote.allowedLogins")).toEqual(["other@example.com"]);
  });

  it("a failed serve command changes no settings and returns its output", async () => {
    const { deps: d } = deps({ serveOk: false, serveOutput: "HTTPS certificates are not enabled" });
    const result = await createRemoteAccess(d).serve("enable", 3000);
    expect(result).toEqual({ ok: false, output: "HTTPS certificates are not enabled", url: null });
    expect(getSetting("remote.tailnetHost")).toBe("");
  });

  it("disabling resets serve and leaves the remote switch alone", async () => {
    const { deps: d, calls } = deps();
    const access = createRemoteAccess(d);
    access.update({ enabled: true });
    await access.serve("disable", 3000);
    expect(calls).toContainEqual(["serve", "reset"]);
    expect(getSetting("remote.enabled")).toBe(true);
  });

  it("rejects an unknown serve action without running anything", async () => {
    const { deps: d, calls } = deps();
    await expect(createRemoteAccess(d).serve("format-disk" as never, 3000)).rejects.toThrow(/unknown/i);
    expect(calls).toEqual([]);
  });
});

describe("listRemoteAudit", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("returns only remote request entries, with login and request", () => {
    recordAudit({ actorId: "me@example.com", action: "remote.request", resourceType: "http", resourceId: "PUT /api/app-settings", result: "allowed" });
    recordAudit({ actorId: "owner", action: "tool.allow", resourceType: "tool", resourceId: "x", result: "allowed" });
    const rows = listRemoteAudit(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ login: "me@example.com", request: "PUT /api/app-settings" });
    expect(typeof rows[0].at).toBe("string");
  });

  it("honours the limit", () => {
    for (let i = 0; i < 5; i++) {
      recordAudit({ actorId: "me@example.com", action: "remote.request", resourceType: "http", resourceId: `POST /x/${i}`, result: "allowed" });
    }
    expect(listRemoteAudit(3)).toHaveLength(3);
  });
});
