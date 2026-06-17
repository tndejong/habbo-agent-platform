// Single home for reading user credentials out of `portal_user_api_keys`.
// Every provider key is stored AES-256-GCM encrypted (see lib/crypto.js); these
// helpers centralize the decrypt + lookup that was previously copy-pasted across
// chat.js, account.js and internal.js. Built as a factory so it receives the
// shared db pool and the decrypt function from server.js via ctx.
//
// Designed to grow into the platform credential vault (integrations, mcp tokens)
// without changing the call sites.
export function createApiKeys({ db, decryptApiKey }) {
  // Decrypt a provider key for a portal user. Returns plaintext or null.
  async function getDecryptedKey(portalUserId, provider) {
    if (!portalUserId) return null;
    const [[row]] = await db.execute(
      'SELECT api_key_encrypted FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
      [portalUserId, provider]
    );
    return row ? decryptApiKey(row.api_key_encrypted) : null;
  }

  // Same, keyed by the hotel-side habbo user id (joins portal_users). This is the
  // bridge that lets hotel components resolve a portal-stored key by habbo id.
  async function getDecryptedKeyByHabbo(habboUserId, provider) {
    if (!habboUserId) return null;
    const [[row]] = await db.execute(
      `SELECT k.api_key_encrypted
       FROM portal_user_api_keys k
       JOIN portal_users u ON u.id = k.portal_user_id
       WHERE u.habbo_user_id = ? AND k.provider = ? LIMIT 1`,
      [habboUserId, provider]
    );
    return row ? decryptApiKey(row.api_key_encrypted) : null;
  }

  // ElevenLabs narrator voice id is stored as its own provider row. Returns the
  // stored id or null (callers apply their own default).
  function getElevenLabsVoice(portalUserId) {
    return getDecryptedKey(portalUserId, 'elevenlabs_voice');
  }

  function getElevenLabsVoiceByHabbo(habboUserId) {
    return getDecryptedKeyByHabbo(habboUserId, 'elevenlabs_voice');
  }

  return {
    getDecryptedKey,
    getDecryptedKeyByHabbo,
    getElevenLabsVoice,
    getElevenLabsVoiceByHabbo,
  };
}
