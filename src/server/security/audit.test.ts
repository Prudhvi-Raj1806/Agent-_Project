import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/server/db/client";
import { recordAudit } from "./audit";

/**
 * Sprint 04 Section 13 — audit_events was documented as "append-only by
 * convention," meaning nothing actually stopped a row from being altered or
 * removed once written; only the fact that no application code happened to
 * do so. `db/schema.ts` now adds two triggers enforcing this at the database
 * level. These tests prove the enforcement is real, not just that the
 * application still behaves — an UPDATE/DELETE issued directly against the
 * table (bypassing `recordAudit` entirely) must still be rejected.
 */
describe("audit_events — DB-enforced append-only", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  function insertOne(): string {
    recordAudit({ actorId: "owner", action: "tool.allow", resourceType: "tool", resourceId: "res-1", result: "allowed" });
    const row = getDb().prepare(`SELECT id FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 1`).get() as { id: string };
    return row.id;
  }

  it("rejects a direct UPDATE against an existing audit row", () => {
    const id = insertOne();
    expect(() => getDb().prepare(`UPDATE audit_events SET result = 'denied' WHERE id = ?`).run(id)).toThrow(/append-only/i);

    const row = getDb().prepare(`SELECT result FROM audit_events WHERE id = ?`).get(id) as { result: string };
    expect(row.result).toBe("allowed"); // unchanged
  });

  it("rejects a direct DELETE against an existing audit row", () => {
    const id = insertOne();
    expect(() => getDb().prepare(`DELETE FROM audit_events WHERE id = ?`).run(id)).toThrow(/append-only/i);

    const row = getDb().prepare(`SELECT id FROM audit_events WHERE id = ?`).get(id);
    expect(row).toBeDefined(); // still there
  });

  it("still allows a normal INSERT via recordAudit", () => {
    const before = (getDb().prepare(`SELECT COUNT(*) as n FROM audit_events`).get() as { n: number }).n;
    insertOne();
    const after = (getDb().prepare(`SELECT COUNT(*) as n FROM audit_events`).get() as { n: number }).n;
    expect(after).toBe(before + 1);
  });
});
