import type { z } from 'zod';
import type { Logger } from '../log.js';
import type { Principal } from '../auth.js';

export interface ToolJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolContext {
  principal: Principal;
  requestId: string;
  logger: Logger;
}

export interface ToolDefinition<TInput = any, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: ToolJsonSchema;
  zod: z.ZodType<TInput>;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export function defineTool<TSchema extends z.ZodTypeAny, TOutput>(def: {
  name: string;
  description: string;
  inputSchema: ToolJsonSchema;
  zod: TSchema;
  handler: (input: z.infer<TSchema>, ctx: ToolContext) => Promise<TOutput>;
}): ToolDefinition<z.infer<TSchema>, TOutput> {
  return def;
}
