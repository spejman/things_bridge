import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { ThingsCliService } from '../src/things-cli.ts';
import { ChangeLog } from '../src/change-log.ts';
import { createServer } from '../src/server.ts';
import type { Task } from '../src/shared/index.ts';

const TOKEN = 'test-token';
const PORT = 13001;
const BASE = `http://localhost:${PORT}`;

const sampleTask: Task = {
  id: 'task-abc',
  title: 'Sample task',
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
let server: ReturnType<typeof createServer>;

function makeRawTask(t: Task) {
  return {
    uuid: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status === 'completed' ? 3 : t.status === 'canceled' ? 2 : 0,
    start: t.status === 'someday' ? 'Someday' : 'Inbox',
    start_date: t.whenDate,
    project_id: t.projectId,
    project_title: t.projectTitle,
    area_id: t.areaId,
    area_title: t.areaTitle,
    tags: t.tags,
    deadline: t.deadline,
    created: t.createdAt.replace('T', ' ').replace('Z', ''),
    modified: t.modifiedAt.replace('T', ' ').replace('Z', ''),
    stop_date: t.completedAt?.replace('T', ' ').replace('Z', '') ?? null,
    trashed: false,
  };
}

// Tracks the "current" state for the mock (mutations update these)
let currentTaskState: Task = { ...sampleTask };
let currentProjectTitle = 'P1';
let currentAreaTitle = 'Work';

beforeAll(() => {
  db = new Database(':memory:');
  const changeLog = new ChangeLog(db);

  const runner = async (args: string[]): Promise<string> => {
    if (args[0] === 'tasks') return JSON.stringify([makeRawTask(currentTaskState)]);
    if (args[0] === 'areas') return JSON.stringify([{ uuid: 'area-1', title: currentAreaTitle, visible: false }]);
    if (args[0] === 'projects') return JSON.stringify([{ uuid: 'proj-1', title: currentProjectTitle, area_id: 'area-1', area_title: 'Work', status: 0, trashed: false }]);
    if (args[0] === 'tags') return JSON.stringify(['work', 'personal']);
    if (args[0] === 'add') {
      // Simulate creating a task: update currentTaskState to have a BridgeID in notes
      const notesIdx = args.indexOf('--notes');
      const bridgeNotes = notesIdx !== -1 ? args[notesIdx + 1] : '';
      currentTaskState = { ...sampleTask, id: 'new-task-id', notes: bridgeNotes };
      return '';
    }
    if (args[0] === 'add-project') {
      currentProjectTitle = args[1];
      return '';
    }
    if (args[0] === 'add-area') {
      currentAreaTitle = args[1];
      return '';
    }
    if (args[0] === 'update' || args[0] === 'update-project' || args[0] === 'update-area') return '';
    if (args[0] === 'cancel' || args[0] === 'trash') return '';
    if (args[0] === 'delete' || args[0] === 'delete-project' || args[0] === 'delete-area') return '';
    return '';
  };

  const cli = new ThingsCliService(runner);
  server = createServer({ port: PORT, token: TOKEN, dbPath: ':memory:' }, cli, changeLog);
});

afterAll(() => {
  server.stop();
  db.close();
});

function auth() {
  return { Authorization: `Bearer ${TOKEN}` };
}

// --- Auth ---
describe('auth', () => {
  test('rejects missing token', async () => {
    const res = await fetch(`${BASE}/api/tasks`);
    expect(res.status).toBe(401);
  });

  test('rejects wrong token', async () => {
    const res = await fetch(`${BASE}/api/tasks`, { headers: { Authorization: 'Bearer wrong' } });
    expect(res.status).toBe(401);
  });
});

// --- Read routes ---
describe('GET /api/tasks', () => {
  test('returns task list', async () => {
    const res = await fetch(`${BASE}/api/tasks`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json() as Task[];
    expect(body).toBeArray();
    expect(body[0].id).toBe(currentTaskState.id);
  });

  test('filters by status', async () => {
    const res = await fetch(`${BASE}/api/tasks?status=inbox`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json() as Task[];
    expect(body.every((t) => t.status === 'inbox')).toBe(true);
  });
});

describe('GET /api/tasks/:id', () => {
  test('returns single task', async () => {
    const res = await fetch(`${BASE}/api/tasks/${currentTaskState.id}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json() as Task;
    expect(body.id).toBe(currentTaskState.id);
  });

  test('returns 404 for unknown task', async () => {
    const res = await fetch(`${BASE}/api/tasks/unknown`, { headers: auth() });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/areas', () => {
  test('returns mapped areas', async () => {
    const res = await fetch(`${BASE}/api/areas`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toBeArray();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('area-1');
    expect(body[0].title).toBeString();
  });
});

describe('GET /api/projects', () => {
  test('returns mapped projects', async () => {
    const res = await fetch(`${BASE}/api/projects`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toBeArray();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('proj-1');
    expect(body[0].areaId).toBe('area-1');
    expect(body[0].status).toBe('active');
  });
});

describe('GET /api/tags', () => {
  test('returns tags', async () => {
    const res = await fetch(`${BASE}/api/tags`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(body).toBeArray();
    expect(body).toHaveLength(2);
  });
});

// --- Mutation routes (will be implemented in Tasks 6-7) ---
describe('POST /api/tasks', () => {
  test('creates a task and returns entryId', async () => {
    currentTaskState = { ...sampleTask }; // reset state
    const res = await fetch(`${BASE}/api/tasks`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New task' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; entryId: string };
    expect(body.entryId).toBeString();
  });

  test('returns 400 for missing title', async () => {
    const res = await fetch(`${BASE}/api/tasks`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'no title' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tasks/:id', () => {
  test('updates a task and returns entryId', async () => {
    currentTaskState = { ...sampleTask };
    const res = await fetch(`${BASE}/api/tasks/${sampleTask.id}`, {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { entryId: string };
    expect(body.entryId).toBeString();
  });
});

describe('POST /api/tasks/:id/complete', () => {
  test('completes a task and returns entryId', async () => {
    currentTaskState = { ...sampleTask };
    const res = await fetch(`${BASE}/api/tasks/${sampleTask.id}/complete`, {
      method: 'POST',
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { entryId: string };
    expect(body.entryId).toBeString();
  });
});

describe('POST /api/tasks/:id/cancel', () => {
  test('cancels a task and returns entryId', async () => {
    currentTaskState = { ...sampleTask };
    const res = await fetch(`${BASE}/api/tasks/${sampleTask.id}/cancel`, {
      method: 'POST',
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { entryId: string };
    expect(body.entryId).toBeString();
  });
});

describe('DELETE /api/tasks/:id', () => {
  test('deletes a task and returns entryId', async () => {
    currentTaskState = { ...sampleTask };
    const res = await fetch(`${BASE}/api/tasks/${sampleTask.id}`, {
      method: 'DELETE',
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { entryId: string };
    expect(body.entryId).toBeString();
  });
});

describe('GET /api/log', () => {
  test('returns change log entries', async () => {
    const res = await fetch(`${BASE}/api/log`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[]; total: number };
    expect(body.entries).toBeArray();
    expect(typeof body.total).toBe('number');
  });
});

describe('POST /api/undo/:entryId', () => {
  test('returns 404 for unknown entryId', async () => {
    const res = await fetch(`${BASE}/api/undo/nonexistent`, { method: 'POST', headers: auth() });
    expect(res.status).toBe(404);
  });

  test('undoes a create by deleting the created task', async () => {
    currentTaskState = { ...sampleTask };
    // First create a task
    const createRes = await fetch(`${BASE}/api/tasks`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Undo me' }),
    });
    expect(createRes.status).toBe(201);
    const { entryId } = await createRes.json() as { entryId: string };
    expect(entryId).toBeString();

    // Now undo it
    const undoRes = await fetch(`${BASE}/api/undo/${entryId}`, {
      method: 'POST',
      headers: auth(),
    });
    expect(undoRes.status).toBe(200);
    const undoBody = await undoRes.json() as { entryId: string };
    expect(undoBody.entryId).toBeString();
    // The undo entryId should be different from the original
    expect(undoBody.entryId).not.toBe(entryId);
  });
});

// --- Project CRUD ---

describe('GET /api/projects/:id', () => {
  test('returns a project by id', async () => {
    const res = await fetch(`${BASE}/api/projects/proj-1`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.id).toBe('proj-1');
  });

  test('returns 404 for unknown project', async () => {
    const res = await fetch(`${BASE}/api/projects/unknown`, { headers: auth() });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/projects', () => {
  test('creates a project and returns id', async () => {
    currentProjectTitle = 'P1';
    const res = await fetch(`${BASE}/api/projects`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Project' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; project: any };
    expect(body.id).toBeString();
  });

  test('returns 400 for missing title', async () => {
    const res = await fetch(`${BASE}/api/projects`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'no title' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/projects/:id', () => {
  test('updates a project', async () => {
    currentProjectTitle = 'P1';
    const res = await fetch(`${BASE}/api/projects/proj-1`, {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Project' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { project: any };
    expect(body.project).toBeDefined();
  });

  test('returns 404 for unknown project', async () => {
    const res = await fetch(`${BASE}/api/projects/unknown`, {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Nope' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:id', () => {
  test('deletes a project', async () => {
    currentProjectTitle = 'P1';
    const res = await fetch(`${BASE}/api/projects/proj-1`, {
      method: 'DELETE',
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { deleted: boolean };
    expect(body.deleted).toBe(true);
  });

  test('returns 404 for unknown project', async () => {
    const res = await fetch(`${BASE}/api/projects/unknown`, {
      method: 'DELETE',
      headers: auth(),
    });
    expect(res.status).toBe(404);
  });
});

// --- Area CRUD ---

describe('GET /api/areas/:id', () => {
  test('returns an area by id', async () => {
    const res = await fetch(`${BASE}/api/areas/area-1`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.id).toBe('area-1');
  });

  test('returns 404 for unknown area', async () => {
    const res = await fetch(`${BASE}/api/areas/unknown`, { headers: auth() });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/areas', () => {
  test('creates an area and returns id', async () => {
    currentAreaTitle = 'Work';
    const res = await fetch(`${BASE}/api/areas`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Area' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; area: any };
    expect(body.id).toBeString();
  });

  test('returns 400 for missing title', async () => {
    const res = await fetch(`${BASE}/api/areas`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/areas/:id', () => {
  test('updates an area', async () => {
    currentAreaTitle = 'Work';
    const res = await fetch(`${BASE}/api/areas/area-1`, {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Area' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { area: any };
    expect(body.area).toBeDefined();
  });

  test('returns 404 for unknown area', async () => {
    const res = await fetch(`${BASE}/api/areas/unknown`, {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Nope' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/areas/:id', () => {
  test('deletes an area', async () => {
    currentAreaTitle = 'Work';
    const res = await fetch(`${BASE}/api/areas/area-1`, {
      method: 'DELETE',
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { deleted: boolean };
    expect(body.deleted).toBe(true);
  });

  test('returns 404 for unknown area', async () => {
    const res = await fetch(`${BASE}/api/areas/unknown`, {
      method: 'DELETE',
      headers: auth(),
    });
    expect(res.status).toBe(404);
  });
});
