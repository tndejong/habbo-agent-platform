import { queryOne } from '../db.js';

interface PlayerRoomRow {
  user_id: number;
  username: string;
  online: string;
  home_room: number;
  active_room_id: number | null;
}

export interface PlayerRoomInfo {
  user_id: number;
  username: string;
  online: boolean;
  current_room_id: number | null;
  source: 'room_enter_log' | 'home_room' | 'none';
}

export async function getPlayerRoom(username: string): Promise<PlayerRoomInfo> {
  const row = await queryOne<PlayerRoomRow>(
    `SELECT
       u.id AS user_id,
       u.username,
       u.online,
       u.home_room,
       (
         SELECT rel.room_id
         FROM room_enter_log rel
         WHERE rel.user_id = u.id AND rel.exit_timestamp = 0
         ORDER BY rel.timestamp DESC
         LIMIT 1
       ) AS active_room_id
     FROM users u
     WHERE u.username = ?
     LIMIT 1`,
    [username]
  );

  if (!row) {
    throw new Error(`Player "${username}" not found`);
  }

  if (row.active_room_id && row.active_room_id > 0) {
    return {
      user_id: row.user_id,
      username: row.username,
      online: row.online !== '0',
      current_room_id: row.active_room_id,
      source: 'room_enter_log',
    };
  }

  if (row.home_room && row.home_room > 0) {
    return {
      user_id: row.user_id,
      username: row.username,
      online: row.online !== '0',
      current_room_id: row.home_room,
      source: 'home_room',
    };
  }

  return {
    user_id: row.user_id,
    username: row.username,
    online: row.online !== '0',
    current_room_id: null,
    source: 'none',
  };
}
