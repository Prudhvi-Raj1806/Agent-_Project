import { describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "./client";

describe("database connection", () => {
  it("waits for a locked database instead of failing at once", () => {
    resetDbForTests(":memory:");
    const row = getDb().prepare("PRAGMA busy_timeout").get() as { timeout: number };
    expect(row.timeout).toBeGreaterThanOrEqual(3000);
  });
});
