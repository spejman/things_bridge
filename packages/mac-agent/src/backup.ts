import { join } from 'node:path';
import { homedir } from 'node:os';
import { ThingsCliService } from './services/things-cli';
import { createBackup, writeBackup } from './services/backup';

const DEFAULT_BACKUP_DIR = join(homedir(), '.things-bridge', 'backups');
const backupDir = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;

const thingsCli = new ThingsCliService();

console.log('Creating Things 3 backup...');

const backup = await createBackup(thingsCli);
const filepath = await writeBackup(backup, backupDir);

console.log(`Backup complete:`);
console.log(`  Areas:    ${backup.areas.length}`);
console.log(`  Projects: ${backup.projects.length}`);
console.log(`  Tags:     ${backup.tags.length}`);
console.log(`  Tasks:    ${backup.tasks.length}`);
console.log(`  File:     ${filepath}`);
