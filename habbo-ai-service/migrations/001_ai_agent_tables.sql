-- AI agent API keys — one row per user, one provider per user for now
CREATE TABLE IF NOT EXISTS ai_api_keys (
  user_id   INT          NOT NULL PRIMARY KEY,
  provider  VARCHAR(50)  NOT NULL DEFAULT 'anthropic',
  api_key   VARCHAR(512) NOT NULL,
  verified  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add ai_agent type to the bots table enum (Arcturus only ships with built-in types)
ALTER TABLE bots MODIFY COLUMN type ENUM('generic','visitor_log','bartender','weapons_dealer','ai_agent') NOT NULL DEFAULT 'generic';

-- Persistent agent configurations — survives emulator restarts
-- Configuration only; conversation memory lives in habbo-ai-service in-memory
CREATE TABLE IF NOT EXISTS ai_agent_configs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  room_id    INT          NOT NULL,
  name       VARCHAR(50)  NOT NULL,
  persona    TEXT         NOT NULL,
  figure     VARCHAR(255) NOT NULL DEFAULT 'hd-180-1.ch-210-66.lg-270-110.sh-300-91',
  gender     CHAR(1)      NOT NULL DEFAULT 'M',
  spawn_x    SMALLINT     NOT NULL DEFAULT 0,
  spawn_y    SMALLINT     NOT NULL DEFAULT 0,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_active (room_id, active),
  INDEX idx_user (user_id)
);

-- Add AI command permissions to Arcturus permissions table.
-- Uses IF NOT EXISTS so this is safe to re-run on an existing database.
-- cmd_set_ai_key  : :set_ai_key command — admin only (rank 7)
-- cmd_setup_agent : :setup_agent command — admin only (rank 7)
-- cmd_ai_help     : :ai command — available to all ranks
ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS cmd_set_ai_key  ENUM('0','1') NOT NULL DEFAULT '0' AFTER cmd_bots,
  ADD COLUMN IF NOT EXISTS cmd_setup_agent ENUM('0','1') NOT NULL DEFAULT '0' AFTER cmd_set_ai_key,
  ADD COLUMN IF NOT EXISTS cmd_ai_help     ENUM('0','1') NOT NULL DEFAULT '1' AFTER cmd_setup_agent;

-- Grant admin-only commands to the highest rank (level = max)
UPDATE permissions
SET cmd_set_ai_key = '1', cmd_setup_agent = '1', cmd_ai_help = '1'
WHERE level = (SELECT max_level FROM (SELECT MAX(level) AS max_level FROM permissions) AS t);

-- Grant the :ai help command to every rank
UPDATE permissions SET cmd_ai_help = '1';
