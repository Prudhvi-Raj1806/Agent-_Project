import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS, SCHEMA_SQL } from "./schema";

/**
 * World-state persistence. Uses Node's built-in `node:sqlite` — no native
 * build step, which matters on a Windows dev machine. This is a single
 * local-file database appropriate for a single-user personal deployment;
 * swapping to Postgres later means replacing this module and the
 * repository layer, not the services that call it.
 */

let instance: DatabaseSync | null = null;

function resolveDbPath(): string {
  return process.env.JARVIS_DB_PATH ?? path.join(process.cwd(), "data", "jarvis.sqlite");
}

function open(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const database = new DatabaseSync(dbPath);
  if (dbPath !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL;");
  }
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(SCHEMA_SQL);
  applyMigrations(database);
  return database;
}

function applyMigrations(database: DatabaseSync): void {
  for (const migration of MIGRATIONS) {
    try {
      database.exec(migration);
    } catch (err) {
      const alreadyApplied = err instanceof Error && /duplicate column name/i.test(err.message);
      if (!alreadyApplied) throw err;
    }
  }
}

/** Lazily-initialized process-wide database handle. */
export function getDb(): DatabaseSync {
  if (!instance) {
    instance = open(resolveDbPath());
  }
  return instance;
}

/** Test-only: force a fresh (typically in-memory) database. */
export function resetDbForTests(dbPath = ":memory:"): DatabaseSync {
  instance?.close();
  instance = open(dbPath);
  return instance;
}
