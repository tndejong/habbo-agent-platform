import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, McpToolDefinition, McpToolResult, Message } from './index.js';

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

  async chatWithTools(
    history: Message[],
    systemPrompt: string,
    tools: McpToolDefinition[],
    onToolCall: (toolName: string, args: Record<string, unknown>) => Promise<McpToolResult>,
  ): Promise<string> {
    const apiTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
    }));

    const messages = history.map((m) => ({ role: m.role, content: m.content }));

    let finalText = '';

    for (let turn = 0; turn < 20; turn++) {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages,
        tools: apiTools,
      });

      const textBlocks: string[] = [];
      const toolResults: { tool_use_id: string; content: string }[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          textBlocks.push(block.text);
        } else if (block.type === 'tool_use') {
          const args = block.input as Record<string, unknown>;
          try {
            const result = await onToolCall(block.name, args);
            toolResults.push({
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            toolResults.push({
              tool_use_id: block.id,
              content: JSON.stringify({ error: errMsg }),
            });
          }
        }
      }

      if (toolResults.length === 0) {
        finalText = textBlocks.join('').trim();
        break;
      }

      messages.push({ role: 'assistant', content: response.content as unknown as string });
      for (const tr of toolResults) {
        messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tr.tool_use_id, content: tr.content }] } as any);
      }
    }

    if (!finalText) {
      finalText = '[Agent finished without a text response]';
    }

    return finalText;
  }

  async verify(): Promise<void> {
    await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
  }
}
