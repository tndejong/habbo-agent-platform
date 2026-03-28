import { sendRconCommand } from '../rcon.js';

const ALLOWED_EMOJI = new Set(['✅', '👋']);

// Strip all emoji-like characters except the allowed set.
// Uses Extended_Pictographic to catch the broad range of pictographic symbols.
function sanitizeMessage(msg: string): string {
  return msg.replace(/\p{Extended_Pictographic}\uFE0F?/gu, (match) =>
    ALLOWED_EMOJI.has(match) ? match : ''
  ).replace(/\s{2,}/g, ' ').trim();
}

export async function talkBot(params: {
  bot_id: number;
  message: string;
  type?: 'talk' | 'shout';
}): Promise<{ success: boolean }> {
  const response = await sendRconCommand('talkbot', {
    bot_id: params.bot_id,
    message: sanitizeMessage(params.message),
    type: params.type ?? 'talk',
  });

  if (response.status !== 0) {
    throw new Error(`Bot not found or not in a loaded room (status ${response.status}): ${response.message}`);
  }

  return { success: true };
}
