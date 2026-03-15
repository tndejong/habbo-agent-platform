import { getUserId } from '../db.js';
import { sendRconCommand } from '../rcon.js';

export async function moveToRoom(params: {
  username: string;
  room_id: number;
}): Promise<{ success: boolean; message: string }> {
  const { username, room_id } = params;

  const userId = await getUserId(username);
  if (!userId) throw new Error(`Player "${username}" not found`);

  // Note: forwarduser Java implementation has a bug where it always returns status 2
  // even on success. We treat any response as "command sent".
  await sendRconCommand('forwarduser', { user_id: userId, room_id });

  return { success: true, message: `Teleport command sent to ${username} → room ${room_id}` };
}
