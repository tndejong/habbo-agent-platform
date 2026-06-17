-- Retire ai_api_keys: API keys now live solely in the portal (portal_user_api_keys,
-- encrypted) and are resolved on demand over the internal service channel.
-- The hotel no longer stores any keys. Safe to re-run.
DROP TABLE IF EXISTS ai_api_keys;
