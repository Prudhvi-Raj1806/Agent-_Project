import { getDb } from "@/server/db/client";
import { newId, nowIso } from "@/server/db/util";
import type { AuditEntry } from "./types";

/** Append-only audit trail. Every consequential action should call this. */
export function recordAudit(entry: AuditEntry): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_events (id, actor_id, action, resource_type, resource_id, result, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId("audit"),
    entry.actorId,
    entry.action,
    entry.resourceType ?? null,
    entry.resourceId ?? null,
    entry.result,
    entry.reason ?? null,
    nowIso()
  );
}
