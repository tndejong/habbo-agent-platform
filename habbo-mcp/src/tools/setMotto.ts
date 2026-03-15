import { getUserId } from '../db.js';
import { sendRconCommand } from '../rcon.js';

export async function setMotto(params: {
  username: string;
  motto: string;
}): Promise<{ success: boolean; message: string }> {
  const { username, motto } = params;

  const userId = await getUserId(username);
  if (!userId) throw new Error(`Player "${username}" not found`);

  const response = await sendRconCommand('setmotto', { user_id: userId, motto });

  if (response.status !== 0) {
    return { success: false, message: response.message || 'RCON error' };
  }
  return { success: true, message: `Updated motto for ${username}` };
}
