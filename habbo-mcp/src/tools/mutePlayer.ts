import { getUserId } from '../db.js';
import { sendRconCommand } from '../rcon.js';

export async function mutePlayer(params: {
  username: string;
  duration: number;
}): Promise<{ success: boolean; message: string }> {
  const { username, duration } = params;

  const userId = await getUserId(username);
  if (!userId) throw new Error(`Player "${username}" not found`);

  const response = await sendRconCommand('muteuser', { user_id: userId, duration });

  if (response.status !== 0) {
    return { success: false, message: response.message || 'RCON error' };
  }
  return { success: true, message: `Muted ${username} for ${duration} seconds` };
}
