import { test, expect, beforeEach, afterEach } from 'bun:test';
import { rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeBackup, type ThingsBackup } from '../../src/services/backup';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `things-backup-test-${Date.now()}`);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function makeBackup(overrides?: Partial<ThingsBackup>): ThingsBackup {
  return {
    version: 1,
    createdAt: '2026-03-08T12:00:00.000Z',
    areas: [{ uuid: 'a1', title: 'Work' }],
    projects: [{ uuid: 'p1', title: 'Project A', status: 'active' }],
    tags: [{ uuid: 't1', title: 'urgent' }],
    tasks: [{ uuid: 'tk1', title: 'Task 1', status: 'open' }],
    ...overrides,
  };
}

test('writeBackup writes valid JSON with correct structure', async () => {
  const backup = makeBackup();
  const filepath = await writeBackup(backup, testDir);

  const content = await Bun.file(filepath).json();
  expect(content.version).toBe(1);
  expect(content.createdAt).toBe('2026-03-08T12:00:00.000Z');
  expect(content.areas).toEqual([{ uuid: 'a1', title: 'Work' }]);
  expect(content.projects).toEqual([{ uuid: 'p1', title: 'Project A', status: 'active' }]);
  expect(content.tags).toEqual([{ uuid: 't1', title: 'urgent' }]);
  expect(content.tasks).toEqual([{ uuid: 'tk1', title: 'Task 1', status: 'open' }]);
});

test('backup file contains all top-level keys', async () => {
  const backup = makeBackup();
  const filepath = await writeBackup(backup, testDir);

  const content = await Bun.file(filepath).json();
  const keys = Object.keys(content);
  expect(keys).toContain('version');
  expect(keys).toContain('createdAt');
  expect(keys).toContain('areas');
  expect(keys).toContain('projects');
  expect(keys).toContain('tags');
  expect(keys).toContain('tasks');
  expect(keys.length).toBe(6);
});

test('writeBackup creates directory if missing', async () => {
  const nestedDir = join(testDir, 'nested', 'deep');
  const backup = makeBackup();
  const filepath = await writeBackup(backup, nestedDir);

  const files = await readdir(nestedDir);
  expect(files.length).toBe(1);
  expect(files[0]).toStartWith('things-backup-');
  expect(files[0]).toEndWith('.json');

  const content = await Bun.file(filepath).json();
  expect(content.version).toBe(1);
});

test('writeBackup uses timestamp in filename', async () => {
  const backup = makeBackup({ createdAt: '2026-03-08T14:30:45.123Z' });
  const filepath = await writeBackup(backup, testDir);

  expect(filepath).toContain('things-backup-2026-03-08_14-30-45-123');
});
