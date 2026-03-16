import type { Request, Response } from 'express';
import { chat, getSession } from '../sessions.js';

export async function chatMessageHandler(req: Request, res: Response): Promise<void> {
  const { bot_id, username, message } = req.body as {
    bot_id: number;
    username: string;
    message: string;
  };

  if (!bot_id || !username || !message) {
    res.status(400).json({ ok: false, error: 'bot_id, username, and message are required' });
    return;
  }

  if (!getSession(bot_id)) {
    res.status(404).json({ ok: false, error: `No active session for bot_id ${bot_id}` });
    return;
  }

  try {
    const reply = await chat(bot_id, username, message);
    res.json({ ok: true, response: reply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
}
