import type { Database } from 'bun:sqlite';
import type { Task, TaskStatus } from '@things-bridge/shared';

export interface TaskFilters {
  status?: TaskStatus;
  projectId?: string;
}

export class TasksService {
  constructor(private db: Database) {}

  getTasks(filters?: TaskFilters): Task[] {
    let query = 'SELECT * FROM tasks';
    const params: unknown[] = [];

    if (filters) {
      const conditions: string[] = [];

      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      if (filters.projectId) {
        conditions.push('project_id = ?');
        params.push(filters.projectId);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }

    query += ' ORDER BY modified_at DESC';

    const rows = this.db.query(query).all(...params) as Array<{
      id: string;
      title: string;
      notes: string | null;
      status: TaskStatus;
      project_id: string | null;
      area_id: string | null;
      tags: string | null;
      checklist_items: string | null;
      deadline: string | null;
      when_date: string | null;
      created_at: string;
      modified_at: string;
      completed_at: string | null;
      canceled_at: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      status: row.status,
      projectId: row.project_id,
      areaId: row.area_id,
      tags: row.tags ? JSON.parse(row.tags) : [],
      checklistItems: row.checklist_items ? JSON.parse(row.checklist_items) : [],
      deadline: row.deadline,
      whenDate: row.when_date,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
      completedAt: row.completed_at,
      canceledAt: row.canceled_at,
    }));
  }

  upsertTasks(tasks: Task[]): void {
    const now = new Date().toISOString();

    this.db.run('BEGIN');

    try {
      const stmt = this.db.prepare(
        `INSERT INTO tasks (
          id, title, notes, status, project_id, area_id, tags, checklist_items,
          deadline, when_date, created_at, modified_at, completed_at, canceled_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          notes = excluded.notes,
          status = excluded.status,
          project_id = excluded.project_id,
          area_id = excluded.area_id,
          tags = excluded.tags,
          checklist_items = excluded.checklist_items,
          deadline = excluded.deadline,
          when_date = excluded.when_date,
          modified_at = excluded.modified_at,
          completed_at = excluded.completed_at,
          canceled_at = excluded.canceled_at,
          synced_at = excluded.synced_at`
      );

      for (const task of tasks) {
        stmt.run(
          task.id,
          task.title,
          task.notes,
          task.status,
          task.projectId,
          task.areaId,
          JSON.stringify(task.tags),
          JSON.stringify(task.checklistItems),
          task.deadline,
          task.whenDate,
          task.createdAt,
          task.modifiedAt,
          task.completedAt,
          task.canceledAt,
          now
        );
      }

      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  updateSyncState(key: string, value: string): void {
    const now = new Date().toISOString();

    this.db
      .query(
        `INSERT INTO sync_state (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .run(key, value, now);
  }

  getSyncState(key: string): string | null {
    const result = this.db.query('SELECT value FROM sync_state WHERE key = ?').get(key) as
      | { value: string }
      | null;

    return result?.value ?? null;
  }
}
