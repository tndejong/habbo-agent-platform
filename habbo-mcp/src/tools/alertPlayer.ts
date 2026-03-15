import { getUserId } from '../db.js';
import { sendRconCommand } from '../rcon.js';

export async function alertPlayer(params: {
  username: string;
  message: string;
}): Promise<{ success: boolean; message: string }> {
  const { username, message } = params;

  const userId = await getUserId(username);
  if (!userId) throw new Error(`Player "${username}" not found`);

  // Note: alertuser always returns status 2 due to a Java bug — treat any response as sent
  await sendRconCommand('alertuser', { user_id: userId, message });

  return { success: true, message: `Alert sent to ${username}` };
}
