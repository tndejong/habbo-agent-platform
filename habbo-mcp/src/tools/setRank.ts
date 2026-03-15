import { getUserId } from '../db.js';
import { sendRconCommand } from '../rcon.js';

export async function setRank(params: {
  username: string;
  rank: number;
}): Promise<{ success: boolean; message: string }> {
  const { username, rank } = params;

  const userId = await getUserId(username);
  if (!userId) throw new Error(`Player "${username}" not found`);

  const response = await sendRconCommand('setrank', { user_id: userId, rank });

  if (response.status !== 0) {
    return { success: false, message: response.message || 'RCON error' };
  }
  return { success: true, message: `Set rank of ${username} to ${rank}` };
}
