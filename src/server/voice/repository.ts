import { getDb } from "@/server/db/client";
import { nowIso } from "@/server/db/util";

const ROW_ID = "default";

interface VoiceConfigRow {
  id: string;
  passcode_hash: string;
  passcode_salt: string;
  updated_at: string;
}

export function saveVoicePasscodeHash(hash: string, salt: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO voice_config (id, passcode_hash, passcode_salt, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       passcode_hash = excluded.passcode_hash,
       passcode_salt = excluded.passcode_salt,
       updated_at = excluded.updated_at`
  ).run(ROW_ID, hash, salt, nowIso());
}

export function getVoicePasscodeHash(): { hash: string; salt: string } | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM voice_config WHERE id = ?`).get(ROW_ID) as unknown as
    | VoiceConfigRow
    | undefined;
  if (!row) return null;
  return { hash: row.passcode_hash, salt: row.passcode_salt };
}

export function clearVoicePasscodeHash(): void {
  const db = getDb();
  db.prepare(`DELETE FROM voice_config WHERE id = ?`).run(ROW_ID);
}
