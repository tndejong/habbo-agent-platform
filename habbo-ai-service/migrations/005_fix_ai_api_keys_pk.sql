-- Fix ai_api_keys PK: change from single-user_id to composite (user_id, provider)
-- so each user can store independent Anthropic and ElevenLabs keys.
-- Safe to re-run: if the PK is already (user_id, provider), DROP then ADD is a no-op.
ALTER TABLE ai_api_keys DROP PRIMARY KEY, ADD PRIMARY KEY (user_id, provider);
