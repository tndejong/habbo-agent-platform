import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

if (!process.env.MCP_API_KEY) {
  console.error('ERROR: MCP_API_KEY environment variable is required');
  process.exit(1);
}

export const config = {
  rcon: {
    host: process.env.RCON_HOST || '127.0.0.1',
    port: parseInt(process.env.RCON_PORT || '3001'),
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '13306'),
    database: process.env.DB_NAME || 'arcturus',
    user: process.env.DB_USER || 'arcturus_user',
    password: process.env.DB_PASSWORD || 'arcturus_pw',
  },
  apiKey: process.env.MCP_API_KEY,
  habboBaseUrl: process.env.HABBO_BASE_URL || 'http://127.0.0.1:1080',
  sync: {
    enabled: process.env.AUTO_AGENT_SYNC === 'true',
    forwardUserChat: process.env.SYNC_FORWARD_USER_CHAT === 'true',
    operatorUsername: process.env.SYNC_OPERATOR_USERNAME || 'Systemaccount',
    transcriptsRoot:
      process.env.SYNC_TRANSCRIPTS_ROOT ||
      path.join(os.homedir(), '.cursor', 'projects'),
    pollMs: parseInt(process.env.SYNC_POLL_MS || '2000', 10),
    talkIntervalMs: parseInt(process.env.SYNC_TALK_INTERVAL_MS || '1200', 10),
    doneIdleMs: parseInt(process.env.SYNC_DONE_IDLE_MS || '4000', 10),
    spawnRetryMs: parseInt(process.env.SYNC_SPAWN_RETRY_MS || '4000', 10),
    spawnX: parseInt(process.env.SYNC_SPAWN_X || '5', 10),
    spawnY: parseInt(process.env.SYNC_SPAWN_Y || '5', 10),
    checkpointFile:
      process.env.SYNC_CHECKPOINT_FILE ||
      path.join(os.homedir(), '.cursor', 'habbo-agent-sync-checkpoint.json'),
    lockFile:
      process.env.SYNC_LOCK_FILE ||
      path.join(os.homedir(), '.cursor', 'habbo-agent-sync.lock'),
  },
};
