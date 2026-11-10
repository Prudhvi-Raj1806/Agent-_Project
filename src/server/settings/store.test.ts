import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { getAllSettings, getSetting, setSettings } from "./store";

describe("settings store", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("returns defaults when nothing is stored", () => {
    expect(getAllSettings()).toEqual({
      "remote.enabled": false,
      "remote.allowedLogins": [],
      "remote.tailnetHost": "",
    });
  });

  it("round-trips a partial update and leaves other keys at their defaults", () => {
    setSettings({ "remote.enabled": true });
    expect(getSetting("remote.enabled")).toBe(true);
    expect(getSetting("remote.allowedLogins")).toEqual([]);
  });

  it("rejects an unknown key and stores nothing", () => {
    expect(() => setSettings({ nope: 1 } as never)).toThrow(/unknown/i);
    expect(getAllSettings()["remote.enabled"]).toBe(false);
  });

  it("is all-or-nothing when one value in a batch is invalid", () => {
    expect(() =>
      setSettings({ "remote.enabled": true, "remote.allowedLogins": "x" as never }),
    ).toThrow();
    expect(getSetting("remote.enabled")).toBe(false);
  });

  it("trims, lower-cases, de-duplicates and caps logins at 5", () => {
    setSettings({ "remote.allowedLogins": [" A@x.com ", "a@x.com", "b@x.com"] });
    expect(getSetting("remote.allowedLogins")).toEqual(["a@x.com", "b@x.com"]);
    expect(() =>
      setSettings({ "remote.allowedLogins": ["1@x", "2@x", "3@x", "4@x", "5@x", "6@x"] }),
    ).toThrow();
  });

  it("rejects a login with a space inside or over 200 characters", () => {
    expect(() => setSettings({ "remote.allowedLogins": ["a b@x.com"] })).toThrow();
    expect(() => setSettings({ "remote.allowedLogins": ["a".repeat(201)] })).toThrow();
  });

  it("accepts only a DNS name or empty for tailnetHost", () => {
    setSettings({ "remote.tailnetHost": "pc.tail1234.ts.net" });
    expect(getSetting("remote.tailnetHost")).toBe("pc.tail1234.ts.net");
    setSettings({ "remote.tailnetHost": "" });
    expect(getSetting("remote.tailnetHost")).toBe("");
    expect(() => setSettings({ "remote.tailnetHost": "evil.com/x" })).toThrow();
    expect(() => setSettings({ "remote.tailnetHost": "a b" })).toThrow();
  });
});
