import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DbConfig {
  path: string;
}

export function initializeDatabase(config: DbConfig): Database {
  const db = new Database(config.path);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const schemaPath = resolve(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  db.exec(schema);

  return db;
}

export function closeDatabase(db: Database): void {
  db.close();
}
