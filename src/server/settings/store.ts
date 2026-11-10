import { getDb } from "@/server/db/client";
import { nowIso } from "@/server/db/util";
import { SETTING_DEFS, isSettingKey, type SettingKey, type SettingsShape } from "./schema";

export type { SettingKey, SettingsShape } from "./schema";

export function getSetting<K extends SettingKey>(key: K): SettingsShape[K] {
  const def = SETTING_DEFS[key];
  const row = getDb().prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as { value: string } | undefined;
  if (!row) return def.default;
  try {
    return def.parse(JSON.parse(row.value)) as SettingsShape[K];
  } catch {
    return def.default;
  }
}

export function getAllSettings(): SettingsShape {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SETTING_DEFS) as SettingKey[]) out[key] = getSetting(key);
  return out as unknown as SettingsShape;
}

/**
 * Validates every key first, then writes them in one transaction, so a bad
 * value anywhere in the batch stores nothing. Throws on an unknown key.
 */
export function setSettings(patch: Partial<SettingsShape>): SettingsShape {
  const parsed: [SettingKey, unknown][] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!isSettingKey(key)) throw new Error(`Unknown setting "${key}".`);
    parsed.push([key, SETTING_DEFS[key].parse(value)]);
  }

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  db.exec("BEGIN");
  try {
    for (const [key, value] of parsed) upsert.run(key, JSON.stringify(value), nowIso());
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return getAllSettings();
}
