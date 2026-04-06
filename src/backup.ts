import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ThingsCliService } from './things-cli.ts';

export interface ThingsBackup {
  version: 1;
  createdAt: string;
  areas: unknown[];
  projects: unknown[];
  tags: unknown[];
  tasks: unknown[];
}

export async function createBackup(cli: ThingsCliService): Promise<ThingsBackup> {
  const [areas, projects, tags, tasks] = await Promise.all([
    cli.getAreas(),
    cli.getProjects(),
    cli.getTags(),
    cli.getRawTasks(),
  ]);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    areas,
    projects,
    tags,
    tasks,
  };
}

export async function writeBackup(backup: ThingsBackup, backupDir: string): Promise<string> {
  await mkdir(backupDir, { recursive: true });

  const timestamp = backup.createdAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const filename = `things-backup-${timestamp}.json`;
  const filepath = join(backupDir, filename);

  await Bun.write(filepath, JSON.stringify(backup, null, 2));

  return filepath;
}
