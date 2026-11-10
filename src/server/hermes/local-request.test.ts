import { describe, expect, it } from "vitest";
import { isLocalRequest } from "./local-request";

const h = (init: Record<string, string>) => ({ get: (n: string) => init[n.toLowerCase()] ?? null });

describe("isLocalRequest", () => {
  it("accepts localhost and loopback hosts, with ports", () => {
    expect(isLocalRequest(h({ host: "localhost:3000" }))).toBe(true);
    expect(isLocalRequest(h({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }))).toBe(true);
    expect(isLocalRequest(h({ host: "[::1]:3000" }))).toBe(true);
  });

  it("rejects other hosts, including look-alikes", () => {
    expect(isLocalRequest(h({ host: "example.com" }))).toBe(false);
    expect(isLocalRequest(h({ host: "localhost.evil.com" }))).toBe(false);
    expect(isLocalRequest(h({}))).toBe(false);
  });

  it("rejects a local host reached from a foreign page", () => {
    expect(isLocalRequest(h({ host: "localhost:3000", origin: "https://evil.example" }))).toBe(false);
    expect(isLocalRequest(h({ host: "localhost:3000", origin: "null" }))).toBe(false);
  });
});
