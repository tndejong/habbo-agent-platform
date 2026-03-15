import { queryMany } from '../db.js';

interface OnlinePlayer {
  id: number;
  username: string;
  look: string;
  gender: string;
  motto: string;
  credits: number;
  rank: number;
}

export async function getOnlinePlayers(params: {
  limit?: number;
}): Promise<OnlinePlayer[]> {
  const limit = Math.min(params.limit || 50, 200);
  return queryMany<OnlinePlayer>(
    `SELECT id, username, look, gender, motto, credits, rank
     FROM users WHERE online = '1' LIMIT ?`,
    [limit]
  );
}
