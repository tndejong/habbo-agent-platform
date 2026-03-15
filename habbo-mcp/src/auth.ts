import { config } from './config.js';

export function validateApiKey(provided: string): void {
  if (provided !== config.apiKey) {
    throw new Error('Invalid API key');
  }
}
