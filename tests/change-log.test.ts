import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { ChangeLog } from '../src/change-log.ts';
import type { Task } from '../src/shared/index.ts';

const task: Task = {
  id: 'abc-123',
  title: 'Test task',
  notes: null,
  status: 'inbox',
  projectId: null,
  projectTitle: null,
  areaId: null,
  areaTitle: null,
  tags: [],
  checklistItems: [],
  deadline: null,
  whenDate: null,
  createdAt: '2026-01-01T10:00:00Z',
  modifiedAt: '2026-01-01T10:00:00Z',
  completedAt: null,
  canceledAt: null,
};

let db: Database;
let log: ChangeLog;

beforeEach(() => {
  db = new Database(':memory:');
  log = new ChangeLog(db);
});

afterEach(() => db.close());

describe('record', () => {
  test('records a create entry and returns it with an id', () => {
    const entry = log.record({ operation: 'create', taskId: 'abc-123', before: null, after: task });
    expect(entry.id).toBeString();
    expect(entry.id).toHaveLength(36); // UUID
    expect(entry.operation).toBe('create');
    expect(entry.taskId).toBe('abc-123');
    expect(entry.before).toBeNull();
    expect(entry.after?.title).toBe('Test task');
    expect(entry.undoneAt).toBeNull();
    expect(entry.createdAt).toBeString();
  });

  test('records an update entry with before and after', () => {
    const after = { ...task, title: 'Updated' };
    const entry = log.record({ operation: 'update', taskId: 'abc-123', before: task, after });
    expect(entry.before?.title).toBe('Test task');
    expect(entry.after?.title).toBe('Updated');
  });

  test('records a delete entry with null after', () => {
    const entry = log.record({ operation: 'delete', taskId: 'abc-123', before: task, after: null });
    expect(entry.after).toBeNull();
    expect(entry.before?.title).toBe('Test task');
  });
});

describe('get', () => {
  test('returns entry by id', () => {
    const entry = log.record({ operation: 'create', taskId: 'abc-123', before: null, after: task });
    const found = log.get(entry.id);
    expect(found?.id).toBe(entry.id);
  });

  test('returns null for unknown id', () => {
    expect(log.get('unknown-id')).toBeNull();
  });
});

describe('list', () => {
  test('returns entries in reverse chronological order', () => {
    const a = log.record({ operation: 'create', taskId: 'a', before: null, after: { ...task, id: 'a' } });
    const b = log.record({ operation: 'create', taskId: 'b', before: null, after: { ...task, id: 'b' } });
    const { entries, total } = log.list({ limit: 10, offset: 0 });
    expect(total).toBe(2);
    expect(entries[0].id).toBe(b.id); // newest first
    expect(entries[1].id).toBe(a.id);
  });

  test('respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      log.record({ operation: 'create', taskId: `t${i}`, before: null, after: { ...task, id: `t${i}` } });
    }
    const { entries, total } = log.list({ limit: 2, offset: 1 });
    expect(total).toBe(5);
    expect(entries).toHaveLength(2);
  });
});

describe('markUndone', () => {
  test('sets undoneAt on the entry', () => {
    const entry = log.record({ operation: 'create', taskId: 'abc-123', before: null, after: task });
    expect(entry.undoneAt).toBeNull();
    log.markUndone(entry.id);
    const updated = log.get(entry.id);
    expect(updated?.undoneAt).toBeString();
  });

  test('throws for unknown id', () => {
    expect(() => log.markUndone('unknown-id')).toThrow();
  });
});
