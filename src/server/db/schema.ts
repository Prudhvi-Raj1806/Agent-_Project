/**
 * Authoritative world-state schema. Kept as a plain string (rather than a
 * .sql asset file) so it survives Next.js bundling unchanged in dev, build,
 * and start. Columns that hold structured data (arrays/objects) are TEXT
 * JSON — the same shape Postgres JSONB would hold, so the repository layer
 * is the only thing that needs to change if this ever moves off SQLite.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  objective TEXT NOT NULL,
  success_criteria TEXT NOT NULL DEFAULT '[]',
  constraints TEXT NOT NULL DEFAULT '[]',
  forbidden_actions TEXT NOT NULL DEFAULT '[]',
  allowed_tools TEXT NOT NULL DEFAULT '[]',
  budget TEXT,
  deadline TEXT,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  current_objective TEXT,
  agents TEXT NOT NULL DEFAULT '[]',
  risks TEXT NOT NULL DEFAULT '[]',
  unknowns TEXT NOT NULL DEFAULT '[]',
  assumptions TEXT NOT NULL DEFAULT '[]',
  checkpoints TEXT NOT NULL DEFAULT '[]',
  result TEXT,
  verification TEXT,
  pending_tool_approval TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  mission_id TEXT,
  agent_id TEXT,
  source TEXT NOT NULL,
  status TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_mission_id ON events(mission_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  health TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS provider_accounts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  api_key_env_var TEXT,
  quota_used_percent INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider_id ON provider_accounts(provider_id);

CREATE TABLE IF NOT EXISTS provider_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  name TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  context_window INTEGER,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_models_provider_id ON provider_models(provider_id);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  mission_id TEXT,
  provider_id TEXT,
  account_id TEXT,
  model_id TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  label TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  verdict TEXT NOT NULL,
  reasons TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  mission_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_references (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  uri TEXT,
  mission_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  time TEXT,
  status TEXT NOT NULL DEFAULT 'today',
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedule_items_starts_at ON schedule_items(starts_at);

-- Single-row table (id is always 'default') — one local user, one Spotify account.
CREATE TABLE IF NOT EXISTS spotify_auth (
  id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Single-row table (id is always 'default') — the voice passcode gating risky
-- Quick Actions, set from the Settings page. Only a salted hash is stored,
-- never the phrase itself. Falls back to JARVIS_VOICE_PASSCODE (env var) when
-- empty, so existing .env.local-only setups keep working unchanged.
CREATE TABLE IF NOT EXISTS voice_config (
  id TEXT PRIMARY KEY,
  passcode_hash TEXT NOT NULL,
  passcode_salt TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  result TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
`;

/**
 * Column additions to tables that already shipped — `CREATE TABLE IF NOT
 * EXISTS` above only helps a brand-new database. Each entry here must be
 * safe to re-run against a database that already has the column (the
 * runner in client.ts swallows SQLite's "duplicate column name" error).
 */
export const MIGRATIONS: string[] = [`ALTER TABLE missions ADD COLUMN pending_tool_approval TEXT`];
