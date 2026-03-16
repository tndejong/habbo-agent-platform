import 'dotenv/config';

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
};
