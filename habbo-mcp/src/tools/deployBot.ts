import { sendRconCommand } from '../rcon.js';
import { execute } from '../db.js';

export async function deployBot(params: {
  room_id: number;
  name: string;
  figure?: string;
  gender?: 'M' | 'F';
  motto?: string;
  x?: number;
  y?: number;
}): Promise<{ bot_id: number; name: string; room_id: number }> {
  const response = await sendRconCommand('deploybot', {
    room_id: params.room_id,
    name: params.name,
    figure: params.figure ?? 'hd-180-1.ch-210-66.lg-270-110.sh-300-91',
    gender: params.gender ?? 'M',
    motto: params.motto ?? '',
    x: params.x ?? 0,
    y: params.y ?? 0,
  });

  if (response.status !== 0) {
    throw new Error(`Failed to deploy bot: ${response.message}`);
  }

  const botId = parseInt(response.message, 10);
  // Keep synced agents in "relax/freeroam" mode so they roam instead of standing still.
  await execute(
    "UPDATE bots SET freeroam = '1', chat_random = '1' WHERE id = ? LIMIT 1",
    [botId]
  );
  return { bot_id: botId, name: params.name, room_id: params.room_id };
}
