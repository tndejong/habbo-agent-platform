import { getUserId } from '../db.js';
import { sendRconCommand } from '../rcon.js';

export async function talkAsPlayer(params: {
  username: string;
  message: string;
  type?: 'talk' | 'whisper' | 'shout';
  bubble_id?: number;
}): Promise<{ success: boolean; message: string }> {
  const { username, message, type = 'talk', bubble_id = -1 } = params;

  const userId = await getUserId(username);
  if (!userId) throw new Error(`Player "${username}" not found`);

  const response = await sendRconCommand('talkuser', {
    user_id: userId,
    message,
    type,
    bubble_id,
  });

  if (response.status === 2) {
    return { success: false, message: `Player "${username}" is not online` };
  }
  if (response.status !== 0) {
    return { success: false, message: response.message || 'RCON error' };
  }
  return { success: true, message: `${username} said: "${message}"` };
}
