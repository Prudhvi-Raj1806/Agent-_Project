import { getDb } from "@/server/db/client";

export interface RemoteAuditRow {
  at: string;
  login: string;
  request: string;
}

/** Most recent changes made from the phone, newest first (see proxy.ts, which writes them). */
export function listRemoteAudit(limit: number): RemoteAuditRow[] {
  const rows = getDb()
    .prepare(
      `SELECT created_at, actor_id, resource_id FROM audit_events
       WHERE action = 'remote.request' ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(Math.max(1, Math.floor(limit))) as { created_at: string; actor_id: string; resource_id: string | null }[];
  return rows.map((r) => ({ at: r.created_at, login: r.actor_id, request: r.resource_id ?? "" }));
}
