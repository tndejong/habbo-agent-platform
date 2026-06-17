-- Add voice_id column to ai_api_keys for ElevenLabs voice selection.
-- Safe to re-run: migration runner catches ER_DUP_FIELDNAME.
ALTER TABLE ai_api_keys ADD COLUMN voice_id VARCHAR(50) DEFAULT NULL;
