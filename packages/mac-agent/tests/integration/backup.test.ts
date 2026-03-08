import { test, expect, afterEach } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ThingsCliService } from '../../src/services/things-cli';
import { createBackup, writeBackup } from '../../src/services/backup';

let cleanupDirs: string[] = [];

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  cleanupDirs = [];
});

test('createBackup returns arrays for all entity types', async () => {
  const thingsCli = new ThingsCliService();
  const backup = await createBackup(thingsCli);

  expect(backup.version).toBe(1);
  expect(typeof backup.createdAt).toBe('string');
  expect(Array.isArray(backup.areas)).toBe(true);
  expect(Array.isArray(backup.projects)).toBe(true);
  expect(Array.isArray(backup.tags)).toBe(true);
  expect(Array.isArray(backup.tasks)).toBe(true);
});

test('createBackup areas contain expected fields', async () => {
  const thingsCli = new ThingsCliService();
  const backup = await createBackup(thingsCli);

  if (backup.areas.length > 0) {
    const area = backup.areas[0] as Record<string, unknown>;
    expect(area).toHaveProperty('uuid');
    expect(area).toHaveProperty('title');
  }
});

test('createBackup tasks contain expected fields', async () => {
  const thingsCli = new ThingsCliService();
  const backup = await createBackup(thingsCli);

  if (backup.tasks.length > 0) {
    const task = backup.tasks[0] as Record<string, unknown>;
    expect(task).toHaveProperty('uuid');
    expect(task).toHaveProperty('title');
    expect(task).toHaveProperty('status');
  }
});

test('full round-trip: create backup, write to disk, read back', async () => {
  const testDir = join(tmpdir(), `things-backup-integration-${Date.now()}`);
  cleanupDirs.push(testDir);

  const thingsCli = new ThingsCliService();
  const backup = await createBackup(thingsCli);
  const filepath = await writeBackup(backup, testDir);

  const content = await Bun.file(filepath).json();

  expect(content.version).toBe(1);
  expect(content.createdAt).toBe(backup.createdAt);
  expect(content.areas).toEqual(backup.areas);
  expect(content.projects).toEqual(backup.projects);
  expect(content.tags).toEqual(backup.tags);
  expect(content.tasks).toEqual(backup.tasks);
});
