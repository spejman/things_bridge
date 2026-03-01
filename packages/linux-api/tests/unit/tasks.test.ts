import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { TasksService } from '../../src/services/tasks.ts';
import { initializeDatabase } from '../../src/db/database.ts';
import type { Task } from '@things-bridge/shared';

describe('TasksService', () => {
  let db: Database;
  let service: TasksService;

  beforeEach(() => {
    db = initializeDatabase({ path: ':memory:' });
    service = new TasksService(db);
  });

  const createSampleTask = (overrides?: Partial<Task>): Task => ({
    id: crypto.randomUUID(),
    title: 'Test Task',
    notes: null,
    status: 'inbox',
    projectId: null,
    areaId: null,
    tags: [],
    checklistItems: [],
    deadline: null,
    whenDate: null,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    completedAt: null,
    canceledAt: null,
    ...overrides,
  });

  describe('upsertTasks', () => {
    test('inserts new tasks', () => {
      const task1 = createSampleTask({ title: 'Task 1' });
      const task2 = createSampleTask({ title: 'Task 2' });

      service.upsertTasks([task1, task2]);

      const tasks = service.getTasks();
      expect(tasks.length).toBe(2);
      expect(tasks.find((t) => t.id === task1.id)?.title).toBe('Task 1');
      expect(tasks.find((t) => t.id === task2.id)?.title).toBe('Task 2');
    });

    test('updates existing tasks', () => {
      const task = createSampleTask({ title: 'Original Title' });

      service.upsertTasks([task]);

      const updatedTask = { ...task, title: 'Updated Title' };
      service.upsertTasks([updatedTask]);

      const tasks = service.getTasks();
      expect(tasks.length).toBe(1);
      expect(tasks[0]?.title).toBe('Updated Title');
    });

    test('handles tasks with tags and checklist items', () => {
      const task = createSampleTask({
        tags: ['work', 'urgent'],
        checklistItems: [
          { title: 'Step 1', completed: false },
          { title: 'Step 2', completed: true },
        ],
      });

      service.upsertTasks([task]);

      const tasks = service.getTasks();
      expect(tasks[0]?.tags).toEqual(['work', 'urgent']);
      expect(tasks[0]?.checklistItems).toHaveLength(2);
      expect(tasks[0]?.checklistItems[0]?.title).toBe('Step 1');
    });

    test('handles nullable fields', () => {
      const task = createSampleTask({
        notes: 'Some notes',
        projectId: crypto.randomUUID(),
        deadline: new Date().toISOString(),
      });

      service.upsertTasks([task]);

      const tasks = service.getTasks();
      expect(tasks[0]?.notes).toBe('Some notes');
      expect(tasks[0]?.projectId).toBe(task.projectId);
      expect(tasks[0]?.deadline).toBe(task.deadline);
    });
  });

  describe('getTasks', () => {
    beforeEach(() => {
      service.upsertTasks([
        createSampleTask({
          id: '00000000-0000-0000-0000-000000000001',
          title: 'Inbox Task',
          status: 'inbox',
        }),
        createSampleTask({
          id: '00000000-0000-0000-0000-000000000002',
          title: 'Today Task',
          status: 'today',
        }),
        createSampleTask({
          id: '00000000-0000-0000-0000-000000000003',
          title: 'Completed Task',
          status: 'completed',
        }),
      ]);
    });

    test('returns all tasks without filters', () => {
      const tasks = service.getTasks();
      expect(tasks.length).toBe(3);
    });

    test('filters by status', () => {
      const tasks = service.getTasks({ status: 'inbox' });
      expect(tasks.length).toBe(1);
      expect(tasks[0]?.title).toBe('Inbox Task');
    });

    test('filters by project ID', () => {
      const projectId = crypto.randomUUID();

      service.upsertTasks([
        createSampleTask({
          id: '00000000-0000-0000-0000-000000000004',
          title: 'Project Task',
          projectId,
        }),
      ]);

      const tasks = service.getTasks({ projectId });
      expect(tasks.length).toBe(1);
      expect(tasks[0]?.title).toBe('Project Task');
    });

    test('filters by multiple criteria', () => {
      const projectId = crypto.randomUUID();

      service.upsertTasks([
        createSampleTask({
          id: '00000000-0000-0000-0000-000000000005',
          title: 'Project Inbox Task',
          status: 'inbox',
          projectId,
        }),
      ]);

      const tasks = service.getTasks({ status: 'inbox', projectId });
      expect(tasks.length).toBe(1);
      expect(tasks[0]?.title).toBe('Project Inbox Task');
    });
  });

  describe('syncState', () => {
    test('updates sync state', () => {
      const timestamp = new Date().toISOString();
      service.updateSyncState('last_snapshot_at', timestamp);

      const value = service.getSyncState('last_snapshot_at');
      expect(value).toBe(timestamp);
    });

    test('overwrites existing sync state', () => {
      service.updateSyncState('agent_last_heartbeat', '2024-01-01T00:00:00Z');
      service.updateSyncState('agent_last_heartbeat', '2024-01-02T00:00:00Z');

      const value = service.getSyncState('agent_last_heartbeat');
      expect(value).toBe('2024-01-02T00:00:00Z');
    });

    test('returns null for non-existent key', () => {
      const value = service.getSyncState('non_existent_key');
      expect(value).toBeNull();
    });
  });
});
