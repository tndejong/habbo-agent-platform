import { config } from '../config.js';

// Single fetch wrapper for the portal internal API. Always attaches the shared
// service secret (X-Internal-Secret) and resolves the base URL from config.
async function portalGet<T>(path: string): Promise<T> {
  if (!config.portal.internalSecret) {
    throw new Error('PORTAL_INTERNAL_SECRET is not configured');
  }
  const res = await fetch(`${config.portal.url}${path}`, {
    method: 'GET',
    headers: { 'X-Internal-Secret': config.portal.internalSecret },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Portal ${path} returned HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function portalPost<T>(path: string, body: unknown): Promise<T> {
  if (!config.portal.internalSecret) {
    throw new Error('PORTAL_INTERNAL_SECRET is not configured');
  }
  const res = await fetch(`${config.portal.url}${path}`, {
    method: 'POST',
    headers: { 'X-Internal-Secret': config.portal.internalSecret, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Portal POST ${path} returned HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// Resolve a portal-stored API key for a habbo user id. Returns null when absent.
export async function fetchApiKeyByHabbo(habboUserId: number, provider: string): Promise<string | null> {
  const data = await portalGet<{ ok: boolean; api_key: string | null }>(
    `/api/internal/hotel-user/${habboUserId}/api-key/${provider}`
  );
  return data.api_key ?? null;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  _source?: { id: string; name: string };
}

export interface McpToolResult {
  content?: unknown;
  error?: string;
}

// Fetch all MCP tools available to a user (hotel + enabled integrations).
export async function fetchUserMcpTools(habboUserId: number): Promise<McpToolDefinition[]> {
  try {
    const data = await portalGet<{ ok: boolean; tools: McpToolDefinition[] }>(
      `/api/internal/hotel-user/${habboUserId}/mcp-tools`
    );
    return data.tools ?? [];
  } catch {
    return [];
  }
}

// Route a tool call through the portal's MCP gateway.
export async function routeMcpToolCall(
  habboUserId: number,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const data = await portalPost<{ ok: boolean; result: McpToolResult }>(
    `/api/internal/hotel-user/${habboUserId}/mcp-call`,
    { tool_name: toolName, args },
  );
  return data.result;
}
