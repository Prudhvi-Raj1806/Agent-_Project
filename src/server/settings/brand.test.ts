import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dbClient from "@/server/db/client";
import { getBrand, getOwnerName } from "./brand";
import { setSettings } from "./store";

describe("getBrand and getOwnerName", () => {
  beforeEach(() => {
    dbClient.resetDbForTests(":memory:");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("are the defaults on a fresh database", () => {
    expect(getBrand()).toBe("Veda");
    expect(getOwnerName()).toBe("Raj");
  });

  it("follow the stored settings", () => {
    setSettings({ "persona.name": "Nova", "persona.ownerName": "Prudhvi" });
    expect(getBrand()).toBe("Nova");
    expect(getOwnerName()).toBe("Prudhvi");
  });

  it("fall back to the defaults when the database can't be read", () => {
    setSettings({ "persona.name": "Nova" });
    vi.spyOn(dbClient, "getDb").mockImplementation(() => {
      throw new Error("database is locked");
    });
    expect(getBrand()).toBe("Veda");
    expect(getOwnerName()).toBe("Raj");
  });
});
