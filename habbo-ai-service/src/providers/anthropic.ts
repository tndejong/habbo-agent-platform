import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, Message } from './index.js';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(history: Message[], systemPrompt: string): Promise<string> {
    const t0 = Date.now();
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
    const elapsed = Date.now() - t0;

    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }
    const text = block.text.trim();
    console.log(`[TIMING] anthropic.chat api_ms=${elapsed} model=${response.model} inputTokens=${response.usage.input_tokens} outputTokens=${response.usage.output_tokens} textLen=${text.length}`);
    return text;
  }

  async verify(): Promise<void> {
    await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
  }
}
