import OpenAI from 'openai';
import type { AIProvider, Message } from './index.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(history: Message[], systemPrompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  async verify(): Promise<void> {
    await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
  }
}
