import { fetchApiKeyByHabbo } from './portalClient.js';

// Resolves the Anthropic chat key for a habbo user from the portal. Throws a
// clear error when no key is configured so callers can surface it to the user.
export async function resolveAnthropicKey(habboUserId: number): Promise<string> {
  const key = await fetchApiKeyByHabbo(habboUserId, 'anthropic');
  if (!key) {
    throw new Error(`No Anthropic API key configured for habbo user ${habboUserId}. Add one in the portal.`);
  }
  return key;
}
