import { getDb } from "@/server/db/client";
import { nowIso } from "@/server/db/util";
import type { SpotifyTokenSet } from "./types";

const ROW_ID = "default";

interface SpotifyAuthRow {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  updated_at: string;
}

export function saveTokens(tokens: SpotifyTokenSet): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO spotify_auth (id, access_token, refresh_token, expires_at, scope, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       scope = excluded.scope,
       updated_at = excluded.updated_at`
  ).run(ROW_ID, tokens.accessToken, tokens.refreshToken, tokens.expiresAt, tokens.scope, nowIso());
}

export function getTokens(): SpotifyTokenSet | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM spotify_auth WHERE id = ?`).get(ROW_ID) as unknown as
    | SpotifyAuthRow
    | undefined;
  if (!row) return null;
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    scope: row.scope,
  };
}

export function clearTokens(): void {
  const db = getDb();
  db.prepare(`DELETE FROM spotify_auth WHERE id = ?`).run(ROW_ID);
}
