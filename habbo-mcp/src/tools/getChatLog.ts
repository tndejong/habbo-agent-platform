import { queryMany } from '../db.js';

interface ChatMessage {
  timestamp: number;
  username: string;
  message: string;
}

export async function getChatLog(params: {
  room_id: number;
  limit?: number;
}): Promise<ChatMessage[]> {
  const { room_id } = params;
  const limit = Math.min(params.limit || 100, 500);

  const rows = await queryMany<ChatMessage>(
    `SELECT c.timestamp, u.username, c.message
     FROM chatlogs_room c
     JOIN users u ON c.user_from_id = u.id
     WHERE c.room_id = ?
     ORDER BY c.timestamp DESC
     LIMIT ?`,
    [room_id, limit]
  );

  return rows.reverse();
}
