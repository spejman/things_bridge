import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ThingsCliService } from '../src/things-cli.ts';
import { createBackup, writeBackup, type ThingsBackup } from '../src/backup.ts';

// ---- writeBackup tests ----

describe('writeBackup', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'backup-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const sampleBackup: ThingsBackup = {
    version: 1,
    createdAt: '2026-04-06T14:30:00.123Z',
    areas: [{ uuid: 'a1', title: 'Work' }],
    projects: [{ uuid: 'p1', title: 'Project A' }],
    tags: [{ uuid: 't1', title: 'urgent' }],
    tasks: [{ uuid: 'tk1', title: 'Buy milk', status: 0 }],
  };

  test('writes valid JSON with correct structure', async () => {
    const filepath = await writeBackup(sampleBackup, tempDir);
    const content = await readFile(filepath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.version).toBe(1);
    expect(parsed.createdAt).toBe('2026-04-06T14:30:00.123Z');
    expect(parsed.areas).toHaveLength(1);
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.tags).toHaveLength(1);
    expect(parsed.tasks).toHaveLength(1);
  });

  test('file contains all 6 top-level keys', async () => {
    const filepath = await writeBackup(sampleBackup, tempDir);
    const content = await readFile(filepath, 'utf-8');
    const parsed = JSON.parse(content);
    const keys = Object.keys(parsed).sort();

    expect(keys).toEqual(['areas', 'createdAt', 'projects', 'tags', 'tasks', 'version']);
  });

  test('creates nested directories if missing', async () => {
    const nestedDir = join(tempDir, 'a', 'b', 'c');
    const filepath = await writeBackup(sampleBackup, nestedDir);

    const content = await readFile(filepath, 'utf-8');
    expect(JSON.parse(content).version).toBe(1);
  });

  test('uses ISO timestamp in filename with safe characters', async () => {
    const filepath = await writeBackup(sampleBackup, tempDir);
    const filename = filepath.split('/').pop()!;

    expect(filename).toBe('things-backup-2026-04-06_14-30-00-123.json');
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('Z');
  });

  test('returns the full filepath', async () => {
    const filepath = await writeBackup(sampleBackup, tempDir);

    expect(filepath.startsWith(tempDir)).toBe(true);
    expect(filepath.endsWith('.json')).toBe(true);
  });

  test('pretty-prints JSON with 2-space indentation', async () => {
    const filepath = await writeBackup(sampleBackup, tempDir);
    const content = await readFile(filepath, 'utf-8');

    expect(content).toContain('  "version": 1');
  });
});

// ---- createBackup tests ----

describe('createBackup', () => {
  test('fetches all entity types in parallel and returns backup object', async () => {
    const calls: string[][] = [];
    const mockRunner = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === 'areas') return JSON.stringify([{ uuid: 'a1', title: 'Work' }]);
      if (args[0] === 'projects') return JSON.stringify([{ uuid: 'p1', title: 'Project' }]);
      if (args[0] === 'tags') return JSON.stringify([{ uuid: 't1', title: 'urgent' }]);
      if (args[0] === 'tasks') return JSON.stringify([{ uuid: 'tk1', title: 'Task', status: 0 }]);
      return '[]';
    };

    const cli = new ThingsCliService(mockRunner);
    const backup = await createBackup(cli);

    expect(backup.version).toBe(1);
    expect(backup.createdAt).toBeTruthy();
    expect(backup.areas).toEqual([{ uuid: 'a1', title: 'Work' }]);
    expect(backup.projects).toEqual([{ uuid: 'p1', title: 'Project' }]);
    expect(backup.tags).toEqual([{ uuid: 't1', title: 'urgent' }]);
    expect(backup.tasks).toEqual([{ uuid: 'tk1', title: 'Task', status: 0 }]);
  });

  test('stores raw task data without mapping', async () => {
    const rawTask = {
      uuid: 'tk1',
      title: 'Raw task',
      status: 0,
      start: 'Anytime',
      start_date: '2026-04-06',
      trashed: false,
      notes: 'original notes',
    };
    const mockRunner = async (args: string[]): Promise<string> => {
      if (args[0] === 'tasks') return JSON.stringify([rawTask]);
      return '[]';
    };

    const cli = new ThingsCliService(mockRunner);
    const backup = await createBackup(cli);

    // Should be the raw object, not mapped through mapThingsTaskToTask
    expect(backup.tasks[0]).toEqual(rawTask);
  });

  test('createdAt is a valid ISO datetime', async () => {
    const mockRunner = async (): Promise<string> => '[]';
    const cli = new ThingsCliService(mockRunner);
    const backup = await createBackup(cli);

    const date = new Date(backup.createdAt);
    expect(date.toISOString()).toBe(backup.createdAt);
  });

  test('handles empty results', async () => {
    const mockRunner = async (): Promise<string> => '[]';
    const cli = new ThingsCliService(mockRunner);
    const backup = await createBackup(cli);

    expect(backup.areas).toEqual([]);
    expect(backup.projects).toEqual([]);
    expect(backup.tags).toEqual([]);
    expect(backup.tasks).toEqual([]);
  });
});
