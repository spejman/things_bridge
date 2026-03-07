import { Database } from 'bun:sqlite';

export interface DbConfig {
  path: string;
}

export async function initializeDatabase(config: DbConfig): Promise<Database> {
  const db = new Database(config.path);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const schemaFile = Bun.file(`${import.meta.dir}/schema.sql`);
  const schema = await schemaFile.text();

  db.exec(schema);

  return db;
}

export function closeDatabase(db: Database): void {
  db.close();
}
