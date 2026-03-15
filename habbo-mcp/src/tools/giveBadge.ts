import { getUserId } from '../db.js';
import { sendRconCommand } from '../rcon.js';

export async function giveBadge(params: {
  username: string;
  badge_code: string;
}): Promise<{ success: boolean; message: string }> {
  const { username, badge_code } = params;

  const userId = await getUserId(username);
  if (!userId) throw new Error(`Player "${username}" not found`);

  const response = await sendRconCommand('givebadge', { user_id: userId, badge: badge_code });

  if (response.status !== 0) {
    return { success: false, message: response.message || 'RCON error' };
  }
  return { success: true, message: response.message || `Gave badge ${badge_code} to ${username}` };
}
