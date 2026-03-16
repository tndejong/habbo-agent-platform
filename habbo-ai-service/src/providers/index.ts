export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIProvider {
  /** Send a conversation and get a reply. systemPrompt is the bot persona. */
  chat(history: Message[], systemPrompt: string): Promise<string>;
  /** Make a cheap test call to verify the API key works. */
  verify(): Promise<void>;
}

import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

type ProviderFactory = (apiKey: string) => AIProvider;

const registry: Record<string, ProviderFactory> = {
  anthropic: (key) => new AnthropicProvider(key),
  openai:    (key) => new OpenAIProvider(key),
  // gemini:  (key) => new GeminiProvider(key),
};

export function createProvider(provider: string, apiKey: string): AIProvider {
  const factory = registry[provider];
  if (!factory) {
    throw new Error(`Unknown AI provider: "${provider}". Supported: ${Object.keys(registry).join(', ')}`);
  }
  return factory(apiKey);
}

export function supportedProviders(): string[] {
  return Object.keys(registry);
}
