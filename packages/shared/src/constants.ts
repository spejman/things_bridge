export const BRIDGE_ID_PREFIX = 'BridgeID:';

export const TIMEOUTS = {
  LOCK_TIMEOUT_MS: 120_000, // 2 minutes
  CLAIM_TIMEOUT_MS: 30_000, // 30 seconds
} as const;

export const INTERVALS = {
  POLL_INTERVAL_MS: 2_000, // 2 seconds
  SNAPSHOT_INTERVAL_MS: 60_000, // 1 minute
  HEARTBEAT_INTERVAL_MS: 30_000, // 30 seconds
  LOCK_CLEANUP_INTERVAL_MS: 60_000, // 1 minute
} as const;

export const RETRY = {
  MAX_ATTEMPTS: 5,
  INITIAL_BACKOFF_MS: 1_000, // 1 second
  MAX_BACKOFF_MS: 300_000, // 5 minutes
  BACKOFF_MULTIPLIER: 2,
} as const;

export const OPERATION_TYPES = {
  CREATE_TASK: 'create_task',
  UPDATE_TASK: 'update_task',
  CANCEL_TASK: 'cancel_task',
} as const;

export const OPERATION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DEADLETTER: 'deadletter',
} as const;

export const TASK_STATUS = {
  INBOX: 'inbox',
  TODAY: 'today',
  UPCOMING: 'upcoming',
  SOMEDAY: 'someday',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
  TRASH: 'trash',
} as const;

export const SCHEMA_VERSION = 1;
