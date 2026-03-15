import { getUserId } from '../db.js';
import { sendRconCommand } from '../rcon.js';

export async function givePixels(params: {
  username: string;
  amount: number;
}): Promise<{ success: boolean; message: string }> {
  const { username, amount } = params;

  const userId = await getUserId(username);
  if (!userId) throw new Error(`Player "${username}" not found`);

  const response = await sendRconCommand('givepixels', { user_id: userId, pixels: amount });

  if (response.status !== 0) {
    return { success: false, message: response.message || 'RCON error' };
  }
  return { success: true, message: `Gave ${amount} pixels (duckets) to ${username}` };
}
