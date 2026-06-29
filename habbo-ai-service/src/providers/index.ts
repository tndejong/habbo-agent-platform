export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface McpToolResult {
  content?: unknown;
  error?: string;
}

export interface AIProvider {
  /** Send a conversation and get a reply. systemPrompt is the bot persona. */
  chat(history: Message[], systemPrompt: string): Promise<string>;
  /** Send a conversation with tool-use support. onToolCall is invoked for each tool_use block. */
  chatWithTools(
    history: Message[],
    systemPrompt: string,
    tools: McpToolDefinition[],
    onToolCall: (toolName: string, args: Record<string, unknown>) => Promise<McpToolResult>,
  ): Promise<string>;
  /** Make a cheap test call to verify the API key works. */
  verify(): Promise<void>;
}

import { AnthropicProvider } from './anthropic.js';

type ProviderFactory = (apiKey: string) => AIProvider;

const registry: Record<string, ProviderFactory> = {
  anthropic: (key) => new AnthropicProvider(key),
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
