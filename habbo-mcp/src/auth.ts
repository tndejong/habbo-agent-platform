import crypto from 'node:crypto';
import { execute, queryOne } from './db.js';
import { getConfig } from './config.js';

export type PlanTier = 'basic' | 'pro' | 'enterprise' | 'internal';

export type Principal = {
  tokenId: number | null;
  portalUserId: number | null;
  habboUserId: number | null;
  tenantId: string;
  planTier: PlanTier;
  scopes: string[];
  channel: string;
  authMode: 'user_token' | 'static_api_key';
};

const PRO_SAFE_TOOLS = new Set<string>([
  'get_online_players',
  'get_room_chat_log',
  'list_bots',
  'deploy_bot',
  'talk_bot',
  'delete_bot',
  'list_figure_types',
  'validate_figure',
  'register_figure_type',
  'talk_as_player',
  'move_player_to_room',
]);

type TokenRow = {
  id: number;
  portal_user_id: number;
  habbo_user_id: number;
  current_ai_tier: PlanTier;
  tenant_id: string;
  plan_tier: PlanTier;
  scopes_json: string | null;
  status: 'active' | 'revoked';
  expires_at: string;
};

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function parseScopes(raw: string | null): string[] {
  if (!raw || !raw.trim().length) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(value => String(value));
    return [];
  } catch {
    return [];
  }
}

function normalizeToken(value?: string | null): string | null {
  if (!value) return null;
  const token = value.trim();
  return token.length ? token : null;
}

export function extractApiToken(args: unknown): string | null {
  if (!args || (typeof args !== 'object')) return null;
  const maybeToken = (args as { api_key?: unknown }).api_key;
  return (typeof maybeToken === 'string') ? normalizeToken(maybeToken) : null;
}

export async function resolvePrincipal(providedToken: string | null, channel: string): Promise<Principal> {
  const cfg = getConfig();
  const candidate = normalizeToken(providedToken);

  if (candidate && cfg.allowStaticApiKeyFallback && cfg.apiKey && (candidate === cfg.apiKey)) {
    return {
      tokenId: null,
      portalUserId: null,
      habboUserId: null,
      tenantId: 'internal',
      planTier: 'internal',
      scopes: [ '*' ],
      channel,
      authMode: 'static_api_key',
    };
  }

  if (!candidate) {
    throw new Error('Missing MCP token');
  }

  const row = await queryOne<TokenRow>(
    `SELECT
      t.id,
      t.portal_user_id,
      u.habbo_user_id,
      u.ai_tier AS current_ai_tier,
      t.tenant_id,
      t.plan_tier,
      t.scopes_json,
      t.status,
      t.expires_at
    FROM portal_mcp_tokens t
    INNER JOIN portal_users u ON u.id = t.portal_user_id
    WHERE t.token_hash = ?
    LIMIT 1`,
    [ sha256(candidate) ]
  );

  if (!row) throw new Error('Invalid MCP token');
  if (row.status !== 'active') throw new Error('MCP token is revoked');

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || (expiresAt.getTime() <= Date.now())) {
    throw new Error('MCP token has expired');
  }

  if (row.plan_tier === 'basic') {
    throw new Error('Your plan does not include MCP access');
  }
  if (row.current_ai_tier === 'basic') {
    throw new Error('Your account tier no longer allows MCP access');
  }

  return {
    tokenId: row.id,
    portalUserId: row.portal_user_id,
    habboUserId: row.habbo_user_id,
    tenantId: row.tenant_id || 'default',
    planTier: row.plan_tier || 'pro',
    scopes: parseScopes(row.scopes_json),
    channel,
    authMode: 'user_token',
  };
}

export function assertToolAllowed(principal: Principal, toolName: string): void {
  if (principal.planTier === 'internal' || principal.planTier === 'enterprise') return;

  if (principal.scopes.includes('*') || principal.scopes.includes(`tool:${toolName}`)) return;

  if (principal.planTier === 'pro' && PRO_SAFE_TOOLS.has(toolName)) return;

  throw new Error(`Tool '${toolName}' is not allowed for your plan`);
}

export async function markTokenUsed(tokenId: number | null): Promise<void> {
  if (!tokenId) return;
  await execute(
    'UPDATE portal_mcp_tokens SET last_used_at = NOW() WHERE id = ? LIMIT 1',
    [ tokenId ]
  );
}

function redactArgs(args: unknown): string {
  if (!args || (typeof args !== 'object')) return '{}';

  const clone = { ...(args as Record<string, unknown>) };
  if ('api_key' in clone) clone.api_key = '[REDACTED]';

  try {
    return JSON.stringify(clone);
  } catch {
    return '{"error":"serialization_failed"}';
  }
}

export async function logToolCall(params: {
  principal: Principal | null;
  toolName: string;
  args: unknown;
  success: boolean;
  errorCode?: string | null;
  durationMs: number;
}): Promise<void> {
  const { principal, toolName, args, success, errorCode, durationMs } = params;

  await execute(
    `INSERT INTO portal_mcp_call_logs
      (token_id, portal_user_id, habbo_user_id, tenant_id, channel, plan_tier, tool_name, args_redacted_json, success, error_code, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      principal?.tokenId ?? null,
      principal?.portalUserId ?? null,
      principal?.habboUserId ?? null,
      principal?.tenantId ?? 'unknown',
      principal?.channel ?? 'unknown',
      principal?.planTier ?? 'unknown',
      toolName,
      redactArgs(args),
      success ? 1 : 0,
      errorCode || null,
      durationMs,
    ]
  );
}

/**
 * Legacy guard kept for compatibility with existing callsites.
 * Real authorization is enforced via resolvePrincipal + assertToolAllowed.
 */
export function validateApiKey(_provided?: string): void {
  return;
}
