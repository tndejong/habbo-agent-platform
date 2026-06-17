import type { Request, Response } from 'express';
import { createProvider } from '../providers/index.js';
import { initSession } from '../sessions.js';
import { resolveAnthropicKey } from '../portal/keyResolver.js';

export async function initSessionHandler(req: Request, res: Response): Promise<void> {
  const { bot_id, persona, user_id, provider = 'anthropic' } = req.body as {
    bot_id: number;
    persona: string;
    user_id: number;
    provider?: string;
  };

  if (!bot_id || !persona || !user_id) {
    res.status(400).json({ ok: false, error: 'bot_id, persona, and user_id are required' });
    return;
  }

  try {
    const apiKey = await resolveAnthropicKey(user_id);
    const aiProvider = createProvider(provider, apiKey);
    initSession(bot_id, aiProvider, persona);
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: message });
  }
}
