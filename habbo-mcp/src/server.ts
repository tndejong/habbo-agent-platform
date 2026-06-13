import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  assertToolAllowed,
  canUseTool,
  extractApiToken,
  logToolCall,
  markTokenUsed,
  resolvePrincipal,
  type Principal,
} from './auth.js';
import { getConfig } from './config.js';
import { log } from './log.js';
import { pingRcon } from './rcon.js';
import { queryOne } from './db.js';
import { renderMetrics, toolCallDuration, toolCallsTotal } from './metrics.js';
import { ALL_TOOLS, TOOL_BY_NAME } from './tools/index.js';
import type { ToolDefinition } from './tools/types.js';

const PUBLIC_TOOLS = ALL_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
}));

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function toErrorResponse(message: string): ToolResponse {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function classifyError(err: unknown): string {
  if (err instanceof z.ZodError) return 'VALIDATION_ERROR';
  if (err instanceof Error) {
    if (err.message.startsWith('Tool ') && err.message.includes('not allowed')) return 'NOT_ALLOWED';
    if (err.message.includes('MCP token')) return 'AUTH_ERROR';
    return 'TOOL_ERROR';
  }
  return 'UNKNOWN';
}

async function safeAudit(payload: {
  principal: Principal | null;
  toolName: string;
  args: unknown;
  success: boolean;
  errorCode: string | null;
  durationMs: number;
}): Promise<void> {
  try {
    await logToolCall({
      principal: payload.principal,
      toolName: payload.toolName,
      args: payload.args,
      success: payload.success,
      errorCode: payload.errorCode,
      durationMs: payload.durationMs,
    });
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'audit log insert failed');
  }
}

async function callTool(
  toolName: string,
  args: unknown,
  channel: string,
  requestId: string
): Promise<ToolResponse> {
  const startedAt = Date.now();
  const reqLog = log.child({ tool: toolName, req: requestId, channel });
  let principal: Principal | null = null;

  const tool: ToolDefinition | undefined = TOOL_BY_NAME.get(toolName);
  if (!tool) {
    reqLog.warn('unknown tool');
    toolCallsTotal.inc({ tool: toolName, outcome: 'unknown' });
    return toErrorResponse(`Unknown tool: ${toolName}`);
  }

  try {
    principal = await resolvePrincipal(extractApiToken(args), channel);
    assertToolAllowed(principal, tool.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorCode = classifyError(err);
    const duration = Date.now() - startedAt;
    reqLog.info({ err: message, errorCode, duration_ms: duration }, 'auth failed');
    toolCallsTotal.inc({ tool: tool.name, outcome: 'auth_error' });
    toolCallDuration.observe({ tool: tool.name }, duration / 1000);
    await safeAudit({ principal, toolName: tool.name, args, success: false, errorCode, durationMs: duration });
    return toErrorResponse(message);
  }

  try {
    const input = tool.zod.parse(args);
    const ctx = { principal, requestId, logger: reqLog };
    const result = await tool.handler(input, ctx);
    const duration = Date.now() - startedAt;
    toolCallsTotal.inc({ tool: tool.name, outcome: 'ok' });
    toolCallDuration.observe({ tool: tool.name }, duration / 1000);
    reqLog.info({ duration_ms: duration }, 'tool ok');
    void markTokenUsed(principal.tokenId).catch((err) =>
      reqLog.warn({ err: err instanceof Error ? err.message : String(err) }, 'markTokenUsed failed')
    );
    await safeAudit({ principal, toolName: tool.name, args, success: true, errorCode: null, durationMs: duration });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorCode = classifyError(err);
    const duration = Date.now() - startedAt;
    reqLog.warn({ err: message, errorCode, duration_ms: duration }, 'tool failed');
    toolCallsTotal.inc({ tool: tool.name, outcome: errorCode === 'VALIDATION_ERROR' ? 'validation_error' : 'error' });
    toolCallDuration.observe({ tool: tool.name }, duration / 1000);
    await safeAudit({ principal, toolName: tool.name, args, success: false, errorCode, durationMs: duration });
    return toErrorResponse(message);
  }
}

function createMcpServer() {
  const server = new Server(
    { name: 'habbo-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: PUBLIC_TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ToolResponse> => {
    const { name, arguments: args } = request.params;
    return callTool(name, args, 'stdio', randomUUID());
  });

  return { server };
}

export async function startStdioServer(): Promise<void> {
  const { server } = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('habbo-mcp server running on stdio');
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(text.trim().length ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.end(JSON.stringify(payload));
}

async function checkDb(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const startedAt = Date.now();
  try {
    await queryOne<{ ok: number }>('SELECT 1 AS ok', []);
    return { ok: true, latency_ms: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const startedAt = Date.now();

export async function startHttpServer(): Promise<void> {
  const cfg = getConfig();

  const httpServer = createServer(async (req, res) => {
    const method = (req.method || 'GET').toUpperCase();
    const url = req.url || '/';

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.end();
      return;
    }

    if (method === 'GET' && (url === '/health' || url === '/healthz')) {
      const [rcon, db] = await Promise.all([pingRcon(), checkDb()]);
      const ok = rcon.ok && db.ok;
      json(res, ok ? 200 : 503, {
        ok,
        checks: { rcon, db },
        version: '1.0.0',
        uptime_s: Math.floor((Date.now() - startedAt) / 1000),
      });
      return;
    }

    if (method === 'GET' && url === '/metrics') {
      try {
        const { contentType, body } = await renderMetrics();
        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.end(body);
      } catch (err) {
        json(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (method === 'GET' && url === '/.well-known/mcp-server.json') {
      json(res, 200, { name: 'habbo-mcp', version: '1.0.0', endpoint: '/mcp', transport: 'http-json' });
      return;
    }

    if (method !== 'POST' || url !== '/mcp') {
      json(res, 404, { error: 'Not found' });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const authHeader = String(req.headers.authorization || '').trim();
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const suppliedToken = extractApiToken(body?.params?.arguments) || bearerToken;
      const methodName = String(body?.method || '');
      const requestId = String(body?.id ?? randomUUID());

      if (methodName === 'initialize') {
        await resolvePrincipal(suppliedToken, 'http');
        json(res, 200, {
          jsonrpc: '2.0',
          id: body?.id ?? null,
          result: {
            protocolVersion: String(body?.params?.protocolVersion || '2024-11-05'),
            capabilities: { tools: {} },
            serverInfo: { name: 'habbo-mcp', version: '1.0.0' },
          },
        });
        return;
      }

      if (methodName === 'notifications/initialized') {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (methodName === 'ping') {
        await resolvePrincipal(suppliedToken, 'http');
        json(res, 200, { jsonrpc: '2.0', id: body?.id ?? null, result: {} });
        return;
      }

      if (methodName === 'tools/list') {
        const principal = await resolvePrincipal(suppliedToken, 'http');
        const visibleTools = PUBLIC_TOOLS.filter((tool) => canUseTool(principal, tool.name));
        json(res, 200, { jsonrpc: '2.0', id: body?.id ?? null, result: { tools: visibleTools } });
        return;
      }

      if (methodName !== 'tools/call') {
        json(res, 400, {
          jsonrpc: '2.0',
          id: body?.id ?? null,
          error: { code: -32601, message: `Unsupported method '${methodName}'` },
        });
        return;
      }

      const toolName = String(body?.params?.name || '');
      const args = body?.params?.arguments || {};
      const payload = { ...(args || {}) } as Record<string, unknown>;
      if (suppliedToken) payload.api_key = suppliedToken;
      const result = await callTool(toolName, payload, 'http', requestId);

      json(res, 200, { jsonrpc: '2.0', id: body?.id ?? null, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: `Invalid request: ${message}` },
      });
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(cfg.http.port, cfg.http.host, () => resolve());
  });
  log.info({ host: cfg.http.host, port: cfg.http.port }, 'habbo-mcp http listening');
}
