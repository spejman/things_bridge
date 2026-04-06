import { test, expect, describe } from 'bun:test';
import { ThingsCliService, mapThingsTaskToTask } from '../src/things-cli.ts';
import type { Task } from '../src/shared/index.ts';

// A minimal raw task as returned by `things tasks --json`
const rawTask = {
  uuid: 'abc-123',
  title: 'Test task',
  notes: 'Some notes',
  status: 0, // OPEN
  start: 'Anytime',
  start_date: null,
  project_id: null,
  project_title: null,
  area_id: null,
  area_title: null,
  tags: ['work'],
  deadline: null,
  created: '2026-01-01 10:00:00',
  modified: '2026-01-02 11:00:00',
  stop_date: null,
  trashed: false,
};

describe('mapThingsTaskToTask', () => {
  test('maps open inbox task', () => {
    const task = mapThingsTaskToTask({ ...rawTask, start: 'Inbox' });
    expect(task.id).toBe('abc-123');
    expect(task.title).toBe('Test task');
    expect(task.status).toBe('inbox');
    expect(task.tags).toEqual(['work']);
    expect(task.createdAt).toBe('2026-01-01T10:00:00Z');
  });

  test('maps today task (Anytime + today start_date)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const task = mapThingsTaskToTask({ ...rawTask, start: 'Anytime', start_date: today });
    expect(task.status).toBe('today');
  });

  test('maps upcoming task (Anytime + future start_date)', () => {
    const task = mapThingsTaskToTask({ ...rawTask, start: 'Anytime', start_date: '2099-12-31' });
    expect(task.status).toBe('upcoming');
  });

  test('maps someday task', () => {
    const task = mapThingsTaskToTask({ ...rawTask, start: 'Someday' });
    expect(task.status).toBe('someday');
  });

  test('maps completed task', () => {
    const task = mapThingsTaskToTask({ ...rawTask, status: 3, stop_date: '2026-01-05 09:00:00' });
    expect(task.status).toBe('completed');
    expect(task.completedAt).toBe('2026-01-05T09:00:00Z');
  });

  test('maps canceled task', () => {
    const task = mapThingsTaskToTask({ ...rawTask, status: 2, stop_date: '2026-01-05 09:00:00' });
    expect(task.status).toBe('canceled');
    expect(task.canceledAt).toBe('2026-01-05T09:00:00Z');
  });

  test('maps Anytime task without start_date to anytime', () => {
    const task = mapThingsTaskToTask({ ...rawTask, start: 'Anytime', start_date: null });
    expect(task.status).toBe('anytime');
  });
});

describe('ThingsCliService', () => {
  test('getSnapshot parses JSON output', async () => {
    const runner = async (args: string[]) => {
      expect(args).toContain('--json');
      return JSON.stringify([rawTask]);
    };
    const cli = new ThingsCliService(runner);
    const tasks = await cli.getSnapshot();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('abc-123');
  });

  test('getAreas parses JSON output', async () => {
    const runner = async (args: string[]) => {
      expect(args[0]).toBe('areas');
      return JSON.stringify([{ uuid: 'area-1', title: 'Work' }]);
    };
    const cli = new ThingsCliService(runner);
    const areas = await cli.getAreas();
    expect(areas).toHaveLength(1);
  });

  test('getProjects parses JSON output', async () => {
    const runner = async (args: string[]) => JSON.stringify([{ uuid: 'proj-1', title: 'P1' }]);
    const cli = new ThingsCliService(runner);
    const projects = await cli.getProjects();
    expect(projects).toHaveLength(1);
  });

  test('getTags parses JSON output', async () => {
    const runner = async (args: string[]) => JSON.stringify(['work', 'personal']);
    const cli = new ThingsCliService(runner);
    const tags = await cli.getTags();
    expect(tags).toHaveLength(2);
  });

  test('updateTask calls update with title arg', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.updateTask('task-uuid', { title: 'Updated' });
    expect(calledArgs).toContain('update');
    expect(calledArgs).toContain('task-uuid');
    expect(calledArgs).toContain('--title');
    expect(calledArgs).toContain('Updated');
  });

  test('completeTask calls update --completed true', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.completeTask('task-uuid');
    expect(calledArgs).toContain('update');
    expect(calledArgs).toContain('--completed');
    expect(calledArgs).toContain('true');
  });

  test('cancelTask calls cancel', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.cancelTask('task-uuid');
    expect(calledArgs[0]).toBe('cancel');
    expect(calledArgs[1]).toBe('task-uuid');
  });

  test('deleteTask calls trash', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.deleteTask('task-uuid');
    expect(calledArgs[0]).toBe('trash');
    expect(calledArgs[1]).toBe('task-uuid');
  });

  test('getTaskById returns null for unknown id', async () => {
    const runner = async () => JSON.stringify([rawTask]);
    const cli = new ThingsCliService(runner);
    const task = await cli.getTaskById('unknown-id');
    expect(task).toBeNull();
  });

  test('getTaskById finds task by id', async () => {
    const runner = async () => JSON.stringify([rawTask]);
    const cli = new ThingsCliService(runner);
    const task = await cli.getTaskById('abc-123');
    expect(task?.title).toBe('Test task');
  });

  test('createTask returns the new task id found by BridgeID', async () => {
    let addArgs: string[] = [];
    let callCount = 0;
    const runner = async (args: string[]): Promise<string> => {
      callCount++;
      if (args[0] === 'add') {
        addArgs = args;
        return '';
      }
      // snapshot call — return a task whose notes contain the BridgeID
      const notesIdx = addArgs.indexOf('--notes');
      const notesVal = notesIdx !== -1 ? addArgs[notesIdx + 1] : '';
      return JSON.stringify([{ ...rawTask, uuid: 'created-id', notes: notesVal }]);
    };
    const cli = new ThingsCliService(runner);
    const id = await cli.createTask({ title: 'My new task' });
    expect(id).toBe('created-id');
    expect(addArgs[0]).toBe('add');
    expect(addArgs[1]).toBe('My new task');
    expect(addArgs).toContain('--notes');
    // notes should contain the BridgeID
    const notesIdx = addArgs.indexOf('--notes');
    expect(addArgs[notesIdx + 1]).toContain('BridgeID:');
  });
});
