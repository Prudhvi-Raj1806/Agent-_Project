import { describe, expect, it } from "vitest";
import { buildServeArgs, parseServeUrl, parseTailscaleStatus, SERVE_RESET_ARGS } from "./tailscale";

const sample = {
  BackendState: "Running",
  Self: { DNSName: "pc.tail1234.ts.net.", UserID: 42 },
  User: { "42": { LoginName: "me@example.com" } },
};

describe("parseTailscaleStatus", () => {
  it("reads the login and DNS name, dropping the trailing dot", () => {
    expect(parseTailscaleStatus(sample)).toEqual({ running: true, loginName: "me@example.com", dnsName: "pc.tail1234.ts.net" });
  });

  it("is not running when the backend isn't in the Running state", () => {
    expect(parseTailscaleStatus({ ...sample, BackendState: "NeedsLogin" }).running).toBe(false);
  });

  it("returns nulls for empty, missing or non-object input", () => {
    const empty = { running: false, loginName: null, dnsName: null };
    expect(parseTailscaleStatus({})).toEqual(empty);
    expect(parseTailscaleStatus(null)).toEqual(empty);
    expect(parseTailscaleStatus("nope")).toEqual(empty);
  });
});

describe("serve commands", () => {
  it("builds the fixed serve arguments for a port", () => {
    expect(buildServeArgs(3000)).toEqual(["serve", "--bg", "--https=443", "http://127.0.0.1:3000"]);
  });

  it("uses a fixed reset command", () => {
    expect(SERVE_RESET_ARGS).toEqual(["serve", "reset"]);
  });

  it("rejects a port that isn't a valid integer", () => {
    expect(() => buildServeArgs(0)).toThrow();
    expect(() => buildServeArgs(70000)).toThrow();
    expect(() => buildServeArgs(3000.5)).toThrow();
  });
});

describe("parseServeUrl", () => {
  it("extracts the tailnet URL from serve output", () => {
    const output = "Available within your tailnet:\n\nhttps://pc.tail1234.ts.net/\n|-- / proxy http://127.0.0.1:3000\n";
    expect(parseServeUrl(output)).toBe("https://pc.tail1234.ts.net/");
  });

  it("returns null when there is no ts.net URL", () => {
    expect(parseServeUrl("nothing here")).toBeNull();
    expect(parseServeUrl("https://example.com/")).toBeNull();
  });
});
