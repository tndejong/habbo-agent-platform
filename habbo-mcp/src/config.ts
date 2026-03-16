// .env is loaded by loadEnv.js (imported first in index.ts)
if (!process.env.MCP_API_KEY) {
  console.error('ERROR: MCP_API_KEY environment variable is required');
  process.exit(1);
}

export type Config = {
  rcon: { host: string; port: number };
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  apiKey: string;
  habboBaseUrl: string;
};

/** Reads current process.env so tunnel-applied RCON/DB host and port are used. */
export function getConfig(): Config {
  return {
    rcon: {
      host: process.env.RCON_HOST || '127.0.0.1',
      port: parseInt(process.env.RCON_PORT || '3001', 10),
    },
    db: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '13306', 10),
      database: process.env.DB_NAME || 'arcturus',
      user: process.env.DB_USER || 'arcturus_user',
      password: process.env.DB_PASSWORD || 'arcturus_pw',
    },
    apiKey: process.env.MCP_API_KEY!,
    habboBaseUrl: process.env.HABBO_BASE_URL || 'http://127.0.0.1:1080',
  };
}
