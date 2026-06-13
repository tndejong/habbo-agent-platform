import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

// Split a SQL file into individual statements. Strips line/block comments,
// respects single- and double-quoted strings so semicolons inside literals
// don't split. Trailing empty fragments are dropped.
function splitSql(sql) {
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--[^\n]*$/gm, '');

  const out = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const prev = i > 0 ? cleaned[i - 1] : '';
    if (!inDouble && !inBacktick && ch === "'" && prev !== '\\') inSingle = !inSingle;
    else if (!inSingle && !inBacktick && ch === '"' && prev !== '\\') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`') inBacktick = !inBacktick;

    if (ch === ';' && !inSingle && !inDouble && !inBacktick) {
      const stmt = buf.trim();
      if (stmt.length) out.push(stmt);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail.length) out.push(tail);
  return out;
}

function listMigrationFiles() {
  let entries;
  try {
    entries = readdirSync(MIGRATIONS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => {
      try { return statSync(join(MIGRATIONS_DIR, name)).isFile(); } catch { return false; }
    })
    .sort();
}

export async function runMigrations(db, { log = () => {} } = {}) {
  const files = listMigrationFiles();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const statements = splitSql(sql);
    log(`[migrate] ${file} (${statements.length} statements)`);
    for (const stmt of statements) {
      await db.query(stmt);
    }
  }
}
