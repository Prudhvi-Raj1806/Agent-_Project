import { describe, expect, it } from "vitest";
import { evaluateAccess, type AccessInput } from "./gate";

const local: AccessInput = {
  host: "localhost:3000",
  origin: null,
  tailscaleLogin: null,
  remoteEnabled: false,
  allowedLogins: [],
  tailnetHost: "",
};

const remote: AccessInput = {
  host: "pc.tail1234.ts.net",
  origin: null,
  tailscaleLogin: "me@example.com",
  remoteEnabled: true,
  allowedLogins: ["me@example.com"],
  tailnetHost: "pc.tail1234.ts.net",
};

const denied = (input: AccessInput) => evaluateAccess(input).allow === false;

describe("evaluateAccess: the owner at the PC", () => {
  it("allows localhost, 127.0.0.1 and [::1] with no Tailscale header", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      expect(evaluateAccess({ ...local, host })).toEqual({ allow: true, via: "local" });
    }
  });

  it("denies a local host reached from a foreign Origin, including Origin: null", () => {
    expect(denied({ ...local, origin: "https://evil.example" })).toBe(true);
    expect(denied({ ...local, origin: "null" })).toBe(true);
    expect(evaluateAccess({ ...local, origin: "http://localhost:3000" }).allow).toBe(true);
  });

  it("denies look-alike and missing hosts", () => {
    expect(denied({ ...local, host: "localhost.evil.com" })).toBe(true);
    expect(denied({ ...local, host: "example.com" })).toBe(true);
    expect(denied({ ...local, host: null })).toBe(true);
  });
});

describe("evaluateAccess: the owner's phone over Tailscale", () => {
  it("allows when remote is on, the login is listed and the host is the tailnet name", () => {
    expect(evaluateAccess(remote)).toEqual({ allow: true, via: "tailscale", login: "me@example.com" });
  });

  it("denies when remote access is off", () => {
    expect(denied({ ...remote, remoteEnabled: false })).toBe(true);
  });

  it("denies a login that isn't listed, and a host that isn't the tailnet name", () => {
    expect(denied({ ...remote, tailscaleLogin: "other@example.com" })).toBe(true);
    expect(denied({ ...remote, host: "pc.other.ts.net" })).toBe(true);
    expect(denied({ ...remote, origin: "https://evil.example" })).toBe(true);
  });

  it("allows nobody when the allowed list is empty, even with remote on", () => {
    expect(denied({ ...remote, allowedLogins: [] })).toBe(true);
  });

  it("matches logins and hosts ignoring case", () => {
    expect(
      evaluateAccess({ ...remote, tailscaleLogin: "ME@Example.com", host: "PC.Tail1234.ts.net" }).allow,
    ).toBe(true);
  });

  it("denies when no tailnet host has been set up", () => {
    expect(denied({ ...remote, tailnetHost: "" })).toBe(true);
  });
});

describe("evaluateAccess: forged requests", () => {
  it("never treats Host: localhost plus a Tailscale header as local", () => {
    expect(denied({ ...remote, host: "localhost:3000", remoteEnabled: false })).toBe(true);
    expect(denied({ ...remote, host: "localhost:3000" })).toBe(true);
  });

  it("denies a Tailscale header sent while remote is off or the login is unlisted", () => {
    expect(denied({ ...local, tailscaleLogin: "attacker@example.com" })).toBe(true);
    expect(denied({ ...remote, remoteEnabled: false, allowedLogins: [] })).toBe(true);
  });
});
