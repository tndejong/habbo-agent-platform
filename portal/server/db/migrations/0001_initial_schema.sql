-- Initial schema snapshot — extracted from server.js ensurePortalSchema()
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Safe to run on existing databases. Future schema changes get their own numbered file.

CREATE TABLE IF NOT EXISTS portal_users (
  id INT NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  username VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  habbo_user_id INT NOT NULL,
  habbo_username VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_email (email),
  UNIQUE KEY uq_portal_username (username),
  UNIQUE KEY uq_portal_habbo_user_id (habbo_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portal_password_resets (
  id BIGINT NOT NULL AUTO_INCREMENT,
  portal_user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  requested_ip VARCHAR(64) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_reset_token_hash (token_hash),
  KEY idx_portal_reset_user (portal_user_id),
  KEY idx_portal_reset_expiry (expires_at),
  CONSTRAINT fk_portal_reset_user
    FOREIGN KEY (portal_user_id) REFERENCES portal_users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE portal_users
  ADD COLUMN IF NOT EXISTS ai_tier ENUM('basic', 'pro', 'enterprise') NOT NULL DEFAULT 'basic'
  AFTER habbo_username;

CREATE TABLE IF NOT EXISTS portal_mcp_tokens (
  id BIGINT NOT NULL AUTO_INCREMENT,
  portal_user_id INT NOT NULL,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
  plan_tier ENUM('pro', 'enterprise') NOT NULL DEFAULT 'pro',
  scopes_json JSON NULL,
  token_hash CHAR(64) NOT NULL,
  token_raw_encrypted TEXT NULL,
  token_label VARCHAR(64) NOT NULL DEFAULT '',
  status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_mcp_token_hash (token_hash),
  KEY idx_portal_mcp_tokens_user (portal_user_id),
  KEY idx_portal_mcp_tokens_status (status),
  CONSTRAINT fk_portal_mcp_tokens_user
    FOREIGN KEY (portal_user_id) REFERENCES portal_users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS is_developer TINYINT(1) NOT NULL DEFAULT 0 AFTER ai_tier;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) NULL AFTER is_developer;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS hotel_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER phone_number;
ALTER TABLE portal_users ADD UNIQUE INDEX IF NOT EXISTS uq_portal_phone_number (phone_number);
ALTER TABLE portal_mcp_tokens ADD COLUMN IF NOT EXISTS token_raw_encrypted TEXT NULL AFTER token_hash;

CREATE TABLE IF NOT EXISTS agent_personas (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  prompt MEDIUMTEXT NOT NULL DEFAULT '',
  figure_type VARCHAR(64) NOT NULL DEFAULT 'agent-m',
  bot_name VARCHAR(25) NOT NULL DEFAULT '',
  created_by_user_id INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_persona_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_teams (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  orchestrator_prompt MEDIUMTEXT NOT NULL DEFAULT '',
  created_by_user_id INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_team_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS pack_source_url TEXT;
ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS role_assignments JSON;
ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(20) NOT NULL DEFAULT 'concurrent';
ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS tasks_json MEDIUMTEXT NOT NULL DEFAULT '[]';
ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en';
ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS category VARCHAR(64) NOT NULL DEFAULT '' AFTER name;

-- Ensure user_personas and user_teams exist before any ALTER TABLE references them.
-- These definitions are intentionally complete so a fresh install gets the correct
-- schema immediately; the identical CREATE TABLE IF NOT EXISTS blocks later become no-ops.
CREATE TABLE IF NOT EXISTS user_personas (
  id INT NOT NULL AUTO_INCREMENT,
  portal_user_id INT NOT NULL,
  source_persona_id INT NULL,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  prompt MEDIUMTEXT NOT NULL DEFAULT '',
  role VARCHAR(64) NOT NULL DEFAULT '',
  capabilities TEXT NOT NULL DEFAULT '',
  figure_type VARCHAR(64) NOT NULL DEFAULT 'agent-m',
  figure TEXT NOT NULL DEFAULT '',
  bot_name VARCHAR(25) NOT NULL DEFAULT '',
  elevenlabs_voice_id VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_persona_name (portal_user_id, name),
  CONSTRAINT fk_up_user FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_teams (
  id INT NOT NULL AUTO_INCREMENT,
  portal_user_id INT NOT NULL,
  source_team_id INT NULL,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  orchestrator_prompt MEDIUMTEXT NOT NULL DEFAULT '',
  execution_mode VARCHAR(20) NOT NULL DEFAULT 'concurrent',
  tasks_json MEDIUMTEXT NOT NULL DEFAULT '[]',
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  default_room_id INT NOT NULL DEFAULT 50,
  marketplace_install_kind ENUM('full','solo') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_team_name (portal_user_id, name),
  CONSTRAINT fk_ut_user FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE user_teams ADD COLUMN IF NOT EXISTS marketplace_install_kind ENUM('full','solo') NULL AFTER source_team_id;
UPDATE user_teams SET marketplace_install_kind = 'full' WHERE source_team_id IS NOT NULL AND marketplace_install_kind IS NULL;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS default_user_team_id INT NULL AFTER hotel_enabled;
ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS role VARCHAR(64) NOT NULL DEFAULT '' AFTER name;
ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS capabilities TEXT NOT NULL DEFAULT '' AFTER role;
ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS figure TEXT NOT NULL DEFAULT '' AFTER figure_type;
ALTER TABLE user_personas ADD COLUMN IF NOT EXISTS elevenlabs_voice_id VARCHAR(100) NULL;

-- Marketplace personas are shared templates — bot_name is per-user and must not be stored here.
UPDATE agent_personas SET bot_name = '' WHERE bot_name != '';

CREATE TABLE IF NOT EXISTS agent_team_members (
  id INT NOT NULL AUTO_INCREMENT,
  team_id INT NOT NULL,
  persona_id INT NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_team_persona (team_id, persona_id),
  CONSTRAINT fk_atm_team FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_atm_persona FOREIGN KEY (persona_id) REFERENCES agent_personas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_flows (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  tasks_json MEDIUMTEXT NOT NULL DEFAULT '[]',
  allowed_tools_json TEXT NOT NULL DEFAULT '[]',
  created_by_user_id INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_flow_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_team_flows (
  id INT NOT NULL AUTO_INCREMENT,
  team_id INT NOT NULL,
  flow_id INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_team_flow (team_id, flow_id),
  CONSTRAINT fk_atf_team FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_atf_flow FOREIGN KEY (flow_id) REFERENCES agent_flows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portal_mcp_call_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  token_id BIGINT NULL,
  portal_user_id INT NULL,
  habbo_user_id INT NULL,
  tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
  channel VARCHAR(32) NOT NULL DEFAULT 'unknown',
  plan_tier VARCHAR(32) NOT NULL DEFAULT 'unknown',
  tool_name VARCHAR(128) NOT NULL,
  args_redacted_json JSON NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  error_code VARCHAR(64) NULL,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_portal_mcp_calls_user (portal_user_id),
  KEY idx_portal_mcp_calls_token (token_id),
  KEY idx_portal_mcp_calls_created (created_at),
  CONSTRAINT fk_portal_mcp_calls_token
    FOREIGN KEY (token_id) REFERENCES portal_mcp_tokens(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_portal_mcp_calls_user
    FOREIGN KEY (portal_user_id) REFERENCES portal_users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_room_templates (
  id INT NOT NULL AUTO_INCREMENT,
  team_id INT NOT NULL,
  bot_name VARCHAR(25) NOT NULL,
  room_id INT NOT NULL,
  x TINYINT NOT NULL DEFAULT 0,
  y TINYINT NOT NULL DEFAULT 0,
  rot TINYINT NOT NULL DEFAULT 2,
  PRIMARY KEY (id),
  UNIQUE KEY uq_team_bot_room (team_id, bot_name, room_id),
  CONSTRAINT fk_art_team FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_packs (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  room_id INT NOT NULL DEFAULT 50,
  pack_source_url TEXT NOT NULL DEFAULT '',
  role_assignments JSON NOT NULL DEFAULT ('{}'),
  created_by_user_id INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pack_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_team_members (
  id INT NOT NULL AUTO_INCREMENT,
  user_team_id INT NOT NULL,
  user_persona_id INT NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_utm (user_team_id, user_persona_id),
  CONSTRAINT fk_utm_team FOREIGN KEY (user_team_id) REFERENCES user_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_utm_persona FOREIGN KEY (user_persona_id) REFERENCES user_personas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portal_user_api_keys (
  id INT NOT NULL AUTO_INCREMENT,
  portal_user_id INT NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'anthropic',
  api_key_encrypted TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_provider (portal_user_id, provider),
  CONSTRAINT fk_puak_user FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tier_upgrade_requests (
  id INT NOT NULL AUTO_INCREMENT,
  portal_user_id INT NOT NULL,
  requested_tier ENUM('pro', 'enterprise') NOT NULL DEFAULT 'pro',
  motivation TEXT NOT NULL DEFAULT '',
  status ENUM('pending', 'approved', 'denied') NOT NULL DEFAULT 'pending',
  admin_note TEXT NOT NULL DEFAULT '',
  reviewed_by_user_id INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tur_user (portal_user_id),
  KEY idx_tur_status (status),
  CONSTRAINT fk_tur_user FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portal_user_integrations (
  id INT NOT NULL AUTO_INCREMENT,
  portal_user_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  url VARCHAR(512) NOT NULL,
  api_key_encrypted TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pui_user (portal_user_id),
  CONSTRAINT fk_pui_user FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE portal_user_integrations ADD COLUMN IF NOT EXISTS stdio_config_encrypted TEXT NULL;

CREATE TABLE IF NOT EXISTS portal_user_feedback (
  id INT NOT NULL AUTO_INCREMENT,
  portal_user_id INT NOT NULL,
  type ENUM('bug','idea','confused','other') NOT NULL DEFAULT 'other',
  page VARCHAR(64) NOT NULL DEFAULT '',
  detail VARCHAR(120) NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  answers_json JSON NOT NULL,
  status ENUM('open','reviewed','resolved') NOT NULL DEFAULT 'open',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_puf_user (portal_user_id),
  KEY idx_puf_status (status),
  CONSTRAINT fk_puf_user FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_run_reports (
  id INT NOT NULL AUTO_INCREMENT,
  room_id INT NOT NULL,
  team_name VARCHAR(128) NOT NULL DEFAULT '',
  triggered_by VARCHAR(64) NOT NULL DEFAULT '',
  portal_user_id INT NOT NULL DEFAULT 0,
  report_md MEDIUMTEXT NOT NULL DEFAULT '',
  cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trr_room (room_id),
  KEY idx_trr_user (portal_user_id),
  KEY idx_trr_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
