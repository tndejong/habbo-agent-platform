import express from 'express';
import { config } from './config.js';
import { runMigrations } from './migrate.js';
import { initSessionHandler } from './routes/initSession.js';
import { chatMessageHandler } from './routes/chatMessage.js';
import { requireServiceSecret } from './middleware/requireServiceSecret.js';
import { resolveAnthropicKey } from './portal/keyResolver.js';
import { createProvider } from './providers/index.js';
import { initSession } from './sessions.js';
import { pool } from './db.js';

const app = express();
app.use(express.json());

// All endpoints are machine-to-machine (emulator -> this service); guard with the service secret.
app.post('/api/init-session', requireServiceSecret, initSessionHandler);
app.post('/api/chat', requireServiceSecret, chatMessageHandler);

app.get('/health', (_req, res) => res.json({ ok: true }));

async function restoreSessionsOnStartup(): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT bot_id, persona, user_id
       FROM ai_agent_configs
       WHERE active = 1 AND bot_id IS NOT NULL AND persona IS NOT NULL`
    );
    for (const row of rows) {
      try {
        const apiKey = await resolveAnthropicKey(row.user_id);
        const provider = createProvider('anthropic', apiKey);
        initSession(row.bot_id, provider, row.persona, row.user_id);
        console.log(`[startup] Restored session for bot_id ${row.bot_id}`);
      } catch (e) {
        console.warn(`[startup] Failed to restore session for bot_id ${row.bot_id}:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.warn('[startup] Could not restore sessions:', (e as Error).message);
  }
}

runMigrations()
  .then(() => restoreSessionsOnStartup())
  .then(() => {
    app.listen(config.port, () => {
      console.log(`habbo-ai-service listening on port ${config.port}`);
    });
  })
  .catch(err => {
    console.error('[migrate] Fatal migration error:', err);
    process.exit(1);
  });
