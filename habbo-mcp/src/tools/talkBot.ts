import { sendRconCommand } from '../rcon.js';

export async function talkBot(params: {
  bot_id: number;
  message: string;
  type?: 'talk' | 'shout';
}): Promise<{ success: boolean }> {
  const response = await sendRconCommand('talkbot', {
    bot_id: params.bot_id,
    message: params.message,
    type: params.type ?? 'talk',
  });

  if (response.status !== 0) {
    throw new Error(`Bot not found or not in a loaded room (status ${response.status}): ${response.message}`);
  }

  return { success: true };
}
