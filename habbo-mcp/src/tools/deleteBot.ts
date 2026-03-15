import { sendRconCommand } from '../rcon.js';
import { execute } from '../db.js';

export async function deleteBot(botId: number): Promise<{ deleted: boolean }> {
  try {
    const response = await sendRconCommand('deletebot', { bot_id: botId });
    if (response.status !== 0) {
      throw new Error(`deletebot returned status ${response.status}: ${response.message || 'unknown RCON error'}`);
    }
    return { deleted: true };
  } catch (err) {
    if (!isUnsupportedDeleteBotRconError(err)) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to delete bot via RCON: ${reason}`);
    }

    // Fallback only when deletebot is not supported by this emulator build.
    await execute('DELETE FROM bots WHERE id = ? LIMIT 1', [botId]);
    return { deleted: true };
  }
}

function isUnsupportedDeleteBotRconError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes('invalid rcon response') ||
    message.includes('unhandled rcon message') ||
    message.includes("couldn't find")
  );
}
