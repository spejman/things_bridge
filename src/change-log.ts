import { Database } from 'bun:sqlite';
import type { Task } from './shared/index.ts';

export type ChangeOperation = 'create' | 'update' | 'complete' | 'cancel' | 'delete' | 'undo';

export interface ChangeEntry {
  id: string;
  operation: ChangeOperation;
  taskId: string;
  before: Task | null;
  after: Task | null;
  createdAt: string;
  undoneAt: string | null;
}

export interface RecordOptions {
  operation: ChangeOperation;
  taskId: string;
  before: Task | null;
  after: Task | null;
}

export interface ListOptions {
  limit: number;
  offset: number;
}

export interface ListResult {
  entries: ChangeEntry[];
  total: number;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS change_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    operation TEXT NOT NULL,
    task_id TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    created_at TEXT NOT NULL,
    undone_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_change_log_created_at ON change_log(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_change_log_task_id ON change_log(task_id);
`;

export class ChangeLog {
  constructor(private db: Database) {
    this.db.exec(SCHEMA);
  }

  record(opts: RecordOptions): ChangeEntry {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO change_log (id, operation, task_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        opts.operation,
        opts.taskId,
        opts.before ? JSON.stringify(opts.before) : null,
        opts.after ? JSON.stringify(opts.after) : null,
        createdAt
      );
    return {
      id,
      operation: opts.operation,
      taskId: opts.taskId,
      before: opts.before,
      after: opts.after,
      createdAt,
      undoneAt: null,
    };
  }

  get(id: string): ChangeEntry | null {
    const row = this.db
      .prepare('SELECT * FROM change_log WHERE id = ?')
      .get(id) as any;
    if (!row) return null;
    return rowToEntry(row);
  }

  list(opts: ListOptions): ListResult {
    const total = (this.db.prepare('SELECT COUNT(*) as n FROM change_log').get() as any).n as number;
    const rows = this.db
      .prepare('SELECT * FROM change_log ORDER BY created_at DESC, seq DESC LIMIT ? OFFSET ?')
      .all(opts.limit, opts.offset) as any[];
    return { entries: rows.map(rowToEntry), total };
  }

  markUndone(id: string): void {
    const result = this.db
      .prepare('UPDATE change_log SET undone_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
    if (result.changes === 0) throw new Error(`Change log entry not found: ${id}`);
  }
}

function rowToEntry(row: any): ChangeEntry {
  return {
    id: row.id,
    operation: row.operation,
    taskId: row.task_id,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
    createdAt: row.created_at,
    undoneAt: row.undone_at ?? null,
  };
}
