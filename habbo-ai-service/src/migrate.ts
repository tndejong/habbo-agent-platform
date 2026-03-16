import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from './config.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Runs all *.sql files in the migrations/ folder in alphabetical order.
 * Each file is split on semicolons and each statement is executed separately.
 * Uses a direct connection (not the pool) so it works before the pool is warm.
 */
export async function runMigrations(): Promise<void> {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: false,
  });

  try {
    const files = (await readdir(MIGRATIONS_DIR))
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      // Strip single-line comments before splitting so semicolons inside
      // comments don't create phantom statements.
      const stripped = sql
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');

      const statements = stripped
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        try {
          await conn.execute(stmt);
        } catch (err: unknown) {
          // Duplicate column errors are harmless on re-runs; log everything else.
          const code = (err as { code?: string }).code;
          if (code === 'ER_DUP_FIELDNAME') continue;
          console.warn(`[migrate] Warning in ${file}: ${(err as Error).message}`);
        }
      }
      console.log(`[migrate] Applied ${file}`);
    }
  } finally {
    await conn.end();
  }
}
