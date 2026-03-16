import type { Request, Response } from 'express';
import { createProvider } from '../providers/index.js';
import { initSession } from '../sessions.js';

export async function initSessionHandler(req: Request, res: Response): Promise<void> {
  const { bot_id, persona, api_key, provider = 'anthropic' } = req.body as {
    bot_id: number;
    persona: string;
    api_key: string;
    provider?: string;
  };

  if (!bot_id || !persona || !api_key) {
    res.status(400).json({ ok: false, error: 'bot_id, persona, and api_key are required' });
    return;
  }

  try {
    const aiProvider = createProvider(provider, api_key);
    initSession(bot_id, aiProvider, persona);
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: message });
  }
}
