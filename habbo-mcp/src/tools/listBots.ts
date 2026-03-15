import { queryMany } from '../db.js';

interface BotRow {
  id: number;
  name: string;
  motto: string;
  figure: string;
  gender: string;
  room_id: number;
  x: number;
  y: number;
}

export async function listBots(): Promise<BotRow[]> {
  return queryMany<BotRow>(
    'SELECT id, name, motto, figure, gender, room_id, x, y FROM bots ORDER BY id ASC',
    []
  );
}
