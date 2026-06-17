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

// Resolve a portal-stored API key for a habbo user id. Returns null when absent.
export async function fetchApiKeyByHabbo(habboUserId: number, provider: string): Promise<string | null> {
  const data = await portalGet<{ ok: boolean; api_key: string | null }>(
    `/api/internal/hotel-user/${habboUserId}/api-key/${provider}`
  );
  return data.api_key ?? null;
}
