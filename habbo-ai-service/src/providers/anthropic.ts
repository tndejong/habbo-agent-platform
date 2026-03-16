import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, Message } from './index.js';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(history: Message[], systemPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 256,
      system: systemPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }
    return block.text.trim();
  }

  async verify(): Promise<void> {
    await this.client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
  }
}
