import { getDb } from "@/server/db/client";
import { fromJson, toJson } from "@/server/db/util";
import type { EventType, JarvisEvent } from "./types";

interface EventRow {
  id: string;
  type: string;
  timestamp: string;
  mission_id: string | null;
  agent_id: string | null;
  source: string;
  status: string | null;
  metadata: string;
}

function rowToEvent(row: EventRow): JarvisEvent {
  return {
    id: row.id,
    type: row.type as EventType,
    timestamp: row.timestamp,
    missionId: row.mission_id,
    agentId: row.agent_id,
    source: row.source,
    status: row.status,
    metadata: fromJson(row.metadata, {}),
  };
}

export function insertEvent(event: JarvisEvent): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO events (id, type, timestamp, mission_id, agent_id, source, status, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.id,
    event.type,
    event.timestamp,
    event.missionId ?? null,
    event.agentId ?? null,
    event.source,
    event.status ?? null,
    toJson(event.metadata)
  );
}

export function listEventsForMission(missionId: string): JarvisEvent[] {
  const db = getDb();
  // rowid tiebreak: several events in the same pipeline step share a millisecond timestamp.
  const rows = db
    .prepare(`SELECT * FROM events WHERE mission_id = ? ORDER BY timestamp ASC, rowid ASC`)
    .all(missionId) as unknown as EventRow[];
  return rows.map(rowToEvent);
}

export function listRecentEvents(limit = 200): JarvisEvent[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM events ORDER BY timestamp DESC, rowid DESC LIMIT ?`)
    .all(limit) as unknown as EventRow[];
  return rows.map(rowToEvent);
}
