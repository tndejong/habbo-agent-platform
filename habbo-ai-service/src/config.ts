import 'dotenv/config';

export const config = {
  port: parseInt(process.env.AI_SERVICE_PORT || '3002'),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '13306'),
    database: process.env.DB_NAME || 'arcturus',
    user: process.env.DB_USER || 'arcturus_user',
    password: process.env.DB_PASSWORD || 'arcturus_pw',
  },
  // Portal is the single source of truth for API keys. This service resolves them
  // over the internal channel (service secret) instead of storing them locally.
  portal: {
    url: (process.env.PORTAL_URL || 'http://agent-portal:3000').replace(/\/$/, ''),
    internalSecret: process.env.PORTAL_INTERNAL_SECRET || '',
  },
};
