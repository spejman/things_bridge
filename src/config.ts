import { join } from 'node:path';

export interface Config {
  port: number;
  dbPath: string;
  token: string;
}

export function loadConfig(): Config {
  const token = process.env['THINGS_PROVIDER_TOKEN'];
  if (!token) throw new Error('THINGS_PROVIDER_TOKEN is required');

  const rawDbPath = process.env['THINGS_PROVIDER_DB_PATH'] ?? '~/.things-provider/change-log.db';
  const dbPath = rawDbPath.startsWith('~/')
    ? join(process.env['HOME'] ?? '.', rawDbPath.slice(2))
    : rawDbPath;

  return {
    port: parseInt(process.env['THINGS_PROVIDER_PORT'] ?? '2714', 10),
    dbPath,
    token,
  };
}
