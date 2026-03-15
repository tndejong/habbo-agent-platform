import mysql from 'mysql2/promise';
import { config } from './config.js';

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  connectionLimit: 5,
  waitForConnections: true,
});

// mysql2's execute() accepts ExecuteValues which is not exported from the top-level
// package. Using `any[]` as the params type is the standard workaround.
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function queryOne<T>(
  sql: string,
  params: any[]
): Promise<T | null> {
  const [rows] = await pool.execute(sql, params);
  const arr = rows as T[];
  return arr.length > 0 ? arr[0] : null;
}

export async function queryMany<T>(
  sql: string,
  params: any[]
): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function execute(
  sql: string,
  params: any[]
): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as mysql.ResultSetHeader;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getUserId(username: string): Promise<number | null> {
  const row = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  return row ? row.id : null;
}
