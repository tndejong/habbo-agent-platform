import { pino, type Logger } from 'pino';

const level = process.env.MCP_LOG_LEVEL || 'info';

export const log: Logger = pino({
  level,
  base: { service: 'habbo-mcp' },
  // Pretty in dev, JSON in prod. Keep JSON by default — easiest to ship to logs.
  redact: {
    paths: ['api_key', '*.api_key', 'token', '*.token', 'password', '*.password'],
    censor: '[REDACTED]',
  },
});

export type { Logger };
