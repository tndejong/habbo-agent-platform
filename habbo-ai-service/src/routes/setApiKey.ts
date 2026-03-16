import type { Request, Response } from 'express';
import { createProvider, supportedProviders } from '../providers/index.js';
import { execute } from '../db.js';

export async function setApiKeyHandler(req: Request, res: Response): Promise<void> {
  const { user_id, api_key, provider = 'anthropic' } = req.body as {
    user_id: number;
    api_key: string;
    provider?: string;
  };

  if (!user_id || !api_key) {
    res.status(400).json({ ok: false, error: 'user_id and api_key are required' });
    return;
  }

  if (!supportedProviders().includes(provider)) {
    res.status(400).json({ ok: false, error: `Unsupported provider "${provider}". Supported: ${supportedProviders().join(', ')}` });
    return;
  }

  try {
    const aiProvider = createProvider(provider, api_key);
    await aiProvider.verify();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ ok: false, error: `API key verification failed: ${message}` });
    return;
  }

  await execute(
    `INSERT INTO ai_api_keys (user_id, provider, api_key, verified)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE provider = VALUES(provider), api_key = VALUES(api_key), verified = 1, updated_at = CURRENT_TIMESTAMP`,
    [user_id, provider, api_key]
  );

  res.json({ ok: true });
}
