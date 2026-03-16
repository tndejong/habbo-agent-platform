import express from 'express';
import { config } from './config.js';
import { runMigrations } from './migrate.js';
import { setApiKeyHandler } from './routes/setApiKey.js';
import { initSessionHandler } from './routes/initSession.js';
import { chatMessageHandler } from './routes/chatMessage.js';

const app = express();
app.use(express.json());

app.post('/api/set-api-key', setApiKeyHandler);
app.post('/api/init-session', initSessionHandler);
app.post('/api/chat', chatMessageHandler);

app.get('/health', (_req, res) => res.json({ ok: true }));

runMigrations()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`habbo-ai-service listening on port ${config.port}`);
    });
  })
  .catch(err => {
    console.error('[migrate] Fatal migration error:', err);
    process.exit(1);
  });
