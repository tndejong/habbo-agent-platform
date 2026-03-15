import { getUserId } from '../db.js';
import { sendRconCommand } from '../rcon.js';

export async function giveDiamonds(params: {
  username: string;
  amount: number;
}): Promise<{ success: boolean; message: string }> {
  const { username, amount } = params;

  const userId = await getUserId(username);
  if (!userId) throw new Error(`Player "${username}" not found`);

  const response = await sendRconCommand('givepoints', { user_id: userId, points: amount });

  if (response.status !== 0) {
    return { success: false, message: response.message || 'RCON error' };
  }
  return { success: true, message: `Gave ${amount} diamonds to ${username}` };
}
