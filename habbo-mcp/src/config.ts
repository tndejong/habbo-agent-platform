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
  allowStaticApiKeyFallback: boolean;
  transport: 'stdio' | 'http' | 'both';
  http: {
    host: string;
    port: number;
  };
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
    apiKey: process.env.MCP_API_KEY || '',
    allowStaticApiKeyFallback: process.env.MCP_ALLOW_STATIC_API_KEY_FALLBACK === 'true',
    transport: (process.env.MCP_TRANSPORT as Config['transport']) || 'stdio',
    http: {
      host: process.env.MCP_HTTP_HOST || '0.0.0.0',
      port: parseInt(process.env.MCP_HTTP_PORT || '3003', 10),
    },
    habboBaseUrl: process.env.HABBO_BASE_URL || 'http://127.0.0.1:1080',
  };
}
