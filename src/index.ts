const _log = console.log.bind(console);
const _error = console.error.bind(console);
console.log = (...args: unknown[]) => _log(new Date().toISOString(), ...args);
console.error = (...args: unknown[]) => _error(new Date().toISOString(), ...args);

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { loadConfig } from './config.ts';
import { ThingsCliService } from './things-cli.ts';
import { ChangeLog } from './change-log.ts';
import { createServer } from './server.ts';

const config = loadConfig();

await mkdir(dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
const changeLog = new ChangeLog(db);
const cli = new ThingsCliService();

const server = createServer(config, cli, changeLog);

const shutdown = () => {
  console.log('[Provider] Shutting down...');
  server.stop();
  db.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[Provider] Things Provider running at http://localhost:${server.port}`);
console.log(`[Provider] DB: ${config.dbPath}`);
