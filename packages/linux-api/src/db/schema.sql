-- Enable WAL mode and foreign keys
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Tasks table: mirror of Things 3 tasks from snapshots
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('inbox', 'today', 'upcoming', 'someday', 'completed', 'canceled', 'trash')),
  project_id TEXT,
  area_id TEXT,
  tags TEXT,
  checklist_items TEXT,
  deadline TEXT,
  when_date TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  completed_at TEXT,
  canceled_at TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_modified_at ON tasks(modified_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

-- Operations queue: pending actions for agent
CREATE TABLE IF NOT EXISTS operations (
  op_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL CHECK (type IN ('create_task', 'update_task', 'cancel_task')),
  payload_json TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'deadletter')),
  locked_at TEXT,
  locked_by TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  last_error TEXT,
  result_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
CREATE INDEX IF NOT EXISTS idx_operations_available_at ON operations(available_at);
CREATE INDEX IF NOT EXISTS idx_operations_locked_by ON operations(locked_by);
CREATE INDEX IF NOT EXISTS idx_operations_idempotency_key ON operations(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ID mapping: optional, tracks BridgeID markers
CREATE TABLE IF NOT EXISTS id_map (
  bridge_id TEXT PRIMARY KEY,
  things_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_id_map_things_id ON id_map(things_id);

-- Sync state: metadata
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Initialize sync state
INSERT OR IGNORE INTO sync_state (key, value) VALUES
  ('last_snapshot_at', datetime('now')),
  ('agent_last_heartbeat', ''),
  ('schema_version', '1');
