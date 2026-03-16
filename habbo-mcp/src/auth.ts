import { getConfig } from './config.js';

/**
 * Resolve and validate the API key. Falls back to the MCP_API_KEY env var
 * when the caller does not supply one (e.g. when Cursor invokes the tool).
 */
export function validateApiKey(provided?: string): void {
  const cfg = getConfig();
  const key = provided || cfg.apiKey;
  if (!key) {
    throw new Error('No API key provided and MCP_API_KEY is not set');
  }
  if (key !== cfg.apiKey) {
    throw new Error('Invalid API key');
  }
}
