import { test, expect, describe } from 'bun:test';
import { ThingsCliService, mapThingsTaskToTask, mapThingsProjectToProject, mapThingsAreaToArea } from '../src/things-cli.ts';
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

  test('getAreas returns mapped areas', async () => {
    const runner = async (args: string[]) => {
      expect(args[0]).toBe('areas');
      return JSON.stringify([{ uuid: 'area-1', title: 'Work', visible: false }]);
    };
    const cli = new ThingsCliService(runner);
    const areas = await cli.getAreas();
    expect(areas).toHaveLength(1);
    expect(areas[0].id).toBe('area-1');
    expect(areas[0].title).toBe('Work');
  });

  test('getProjects returns mapped projects', async () => {
    const runner = async (args: string[]) => JSON.stringify([{ uuid: 'proj-1', title: 'P1', status: 0, area_id: 'a1', area_title: 'Work', trashed: false }]);
    const cli = new ThingsCliService(runner);
    const projects = await cli.getProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('proj-1');
    expect(projects[0].areaId).toBe('a1');
    expect(projects[0].status).toBe('active');
  });

  test('getTags parses JSON output', async () => {
    const runner = async (args: string[]) => JSON.stringify(['work', 'personal']);
    const cli = new ThingsCliService(runner);
    const tags = await cli.getTags();
    expect(tags).toHaveLength(2);
  });

  test('updateTask calls update with --id and title', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.updateTask('task-uuid', { title: 'Updated' });
    expect(calledArgs).toContain('update');
    expect(calledArgs).toContain('--id=task-uuid');
    expect(calledArgs).toContain('Updated');
  });

  test('updateTask passes --list-id for projectId', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.updateTask('task-uuid', { projectId: 'proj-uuid' });
    expect(calledArgs).toContain('--list-id=proj-uuid');
  });

  test('updateTask passes --list-id for areaId', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.updateTask('task-uuid', { areaId: 'area-uuid' });
    expect(calledArgs).toContain('--list-id=area-uuid');
  });

  test('updateTask prefers projectId over areaId for --list-id', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.updateTask('task-uuid', { projectId: 'proj-uuid', areaId: 'area-uuid' });
    expect(calledArgs).toContain('--list-id=proj-uuid');
    expect(calledArgs).not.toContain('--list-id=area-uuid');
  });

  test('completeTask calls update --id --completed', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.completeTask('task-uuid');
    expect(calledArgs).toContain('update');
    expect(calledArgs).toContain('--id=task-uuid');
    expect(calledArgs).toContain('--completed');
  });

  test('cancelTask calls update --canceled', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.cancelTask('task-uuid');
    expect(calledArgs).toContain('update');
    expect(calledArgs).toContain('--id=task-uuid');
    expect(calledArgs).toContain('--canceled');
  });

  test('deleteTask calls delete with --id and --confirm', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.deleteTask('task-uuid');
    expect(calledArgs).toContain('delete');
    expect(calledArgs).toContain('--id=task-uuid');
    expect(calledArgs).toContain('--confirm=task-uuid');
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

  // --- Project methods ---

  test('getProjectById returns null for unknown id', async () => {
    const runner = async () => JSON.stringify([{ uuid: 'proj-1', title: 'P1', status: 0, trashed: false }]);
    const cli = new ThingsCliService(runner);
    expect(await cli.getProjectById('unknown')).toBeNull();
  });

  test('getProjectById finds project by id', async () => {
    const runner = async () => JSON.stringify([{ uuid: 'proj-1', title: 'P1', status: 0, trashed: false }]);
    const cli = new ThingsCliService(runner);
    const project = await cli.getProjectById('proj-1');
    expect(project?.title).toBe('P1');
  });

  test('createProject calls add-project and finds by title', async () => {
    let addArgs: string[] = [];
    const runner = async (args: string[]): Promise<string> => {
      if (args[0] === 'add-project') {
        addArgs = args;
        return '';
      }
      return JSON.stringify([{ uuid: 'new-proj', title: 'My Project', status: 0, trashed: false }]);
    };
    const cli = new ThingsCliService(runner);
    const id = await cli.createProject({ title: 'My Project' });
    expect(id).toBe('new-proj');
    expect(addArgs[0]).toBe('add-project');
    expect(addArgs[1]).toBe('My Project');
  });

  test('createProject passes optional flags', async () => {
    let addArgs: string[] = [];
    const runner = async (args: string[]): Promise<string> => {
      if (args[0] === 'add-project') { addArgs = args; return ''; }
      return JSON.stringify([{ uuid: 'new-proj', title: 'P', status: 0, trashed: false }]);
    };
    const cli = new ThingsCliService(runner);
    await cli.createProject({ title: 'P', notes: 'n', deadline: '2026-12-31', tags: ['a', 'b'], areaId: 'area-1' });
    expect(addArgs).toContain('--notes');
    expect(addArgs).toContain('--deadline');
    expect(addArgs).toContain('--tags');
    expect(addArgs).toContain('--area-id');
  });

  test('updateProject calls update-project with correct args', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.updateProject('proj-1', { title: 'New Title', notes: 'new notes' });
    expect(calledArgs[0]).toBe('update-project');
    expect(calledArgs).toContain('--id=proj-1');
    expect(calledArgs).toContain('New Title');
    expect(calledArgs).toContain('--notes=new notes');
  });

  test('updateProject passes --completed and --canceled', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.updateProject('proj-1', { completed: true });
    expect(calledArgs).toContain('--completed');
  });

  test('deleteProject calls delete-project with --id and --confirm', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.deleteProject('proj-1');
    expect(calledArgs).toContain('delete-project');
    expect(calledArgs).toContain('--id=proj-1');
    expect(calledArgs).toContain('--confirm=proj-1');
  });

  // --- Area methods ---

  test('getAreaById returns null for unknown id', async () => {
    const runner = async () => JSON.stringify([{ uuid: 'area-1', title: 'Work', visible: false }]);
    const cli = new ThingsCliService(runner);
    expect(await cli.getAreaById('unknown')).toBeNull();
  });

  test('getAreaById finds area by id', async () => {
    const runner = async () => JSON.stringify([{ uuid: 'area-1', title: 'Work', visible: false }]);
    const cli = new ThingsCliService(runner);
    const area = await cli.getAreaById('area-1');
    expect(area?.title).toBe('Work');
  });

  test('createArea calls add-area and finds by title', async () => {
    let addArgs: string[] = [];
    const runner = async (args: string[]): Promise<string> => {
      if (args[0] === 'add-area') { addArgs = args; return ''; }
      return JSON.stringify([{ uuid: 'new-area', title: 'My Area', visible: true }]);
    };
    const cli = new ThingsCliService(runner);
    const id = await cli.createArea({ title: 'My Area' });
    expect(id).toBe('new-area');
    expect(addArgs[0]).toBe('add-area');
    expect(addArgs[1]).toBe('My Area');
  });

  test('updateArea calls update-area with correct args', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.updateArea('area-1', { title: 'Renamed', tags: ['tag1'] });
    expect(calledArgs[0]).toBe('update-area');
    expect(calledArgs).toContain('--id=area-1');
    expect(calledArgs).toContain('Renamed');
    expect(calledArgs).toContain('--tags=tag1');
  });

  test('deleteArea calls delete-area with --id and --confirm', async () => {
    let calledArgs: string[] = [];
    const runner = async (args: string[]) => { calledArgs = args; return ''; };
    const cli = new ThingsCliService(runner);
    await cli.deleteArea('area-1');
    expect(calledArgs).toContain('delete-area');
    expect(calledArgs).toContain('--id=area-1');
    expect(calledArgs).toContain('--confirm=area-1');
  });
});

// --- Mapping functions ---

describe('mapThingsProjectToProject', () => {
  test('maps active project', () => {
    const p = mapThingsProjectToProject({ uuid: 'p1', title: 'Proj', status: 0, area_id: 'a1', area_title: 'Work', trashed: false, tags: ['dev'] });
    expect(p.id).toBe('p1');
    expect(p.title).toBe('Proj');
    expect(p.status).toBe('active');
    expect(p.areaId).toBe('a1');
    expect(p.areaTitle).toBe('Work');
    expect(p.tags).toEqual(['dev']);
  });

  test('maps completed project', () => {
    const p = mapThingsProjectToProject({ uuid: 'p1', title: 'Done', status: 3, trashed: false });
    expect(p.status).toBe('completed');
  });

  test('maps canceled project', () => {
    const p = mapThingsProjectToProject({ uuid: 'p1', title: 'Nope', status: 2, trashed: false });
    expect(p.status).toBe('canceled');
  });

  test('maps trashed project', () => {
    const p = mapThingsProjectToProject({ uuid: 'p1', title: 'Trash', status: 0, trashed: true });
    expect(p.status).toBe('trash');
  });

  test('defaults missing fields', () => {
    const p = mapThingsProjectToProject({ uuid: 'p1', title: 'Minimal', status: 0, trashed: false });
    expect(p.areaId).toBeNull();
    expect(p.areaTitle).toBeNull();
    expect(p.tags).toEqual([]);
  });
});

describe('mapThingsAreaToArea', () => {
  test('maps area with visible field', () => {
    const a = mapThingsAreaToArea({ uuid: 'a1', title: 'Work', visible: false });
    expect(a.id).toBe('a1');
    expect(a.title).toBe('Work');
    expect(a.visible).toBe(false);
  });

  test('defaults visible to true when missing', () => {
    const a = mapThingsAreaToArea({ uuid: 'a1', title: 'Work' });
    expect(a.visible).toBe(true);
  });
});
