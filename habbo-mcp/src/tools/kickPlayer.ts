import { sendRconCommand } from '../rcon.js';

export async function kickPlayer(params: {
  username: string;
}): Promise<{ success: boolean; message: string }> {
  const { username } = params;

  const response = await sendRconCommand('disconnect', { user_id: -1, username });

  if (response.status !== 0) {
    return { success: false, message: response.message || 'Player not online or not found' };
  }
  return { success: true, message: response.message || `Kicked ${username}` };
}
