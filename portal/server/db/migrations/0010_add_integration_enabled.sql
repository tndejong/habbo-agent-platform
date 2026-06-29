ALTER TABLE portal_user_integrations
  ADD COLUMN IF NOT EXISTS enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER stdio_config_encrypted;
