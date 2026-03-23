import path from 'node:path';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let portalPkgVersion = '0.1.0';
try {
  portalPkgVersion = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
} catch { /* ignore */ }

function distMainJsFingerprint() {
  try {
    const html = readFileSync(path.join(__dirname, 'dist/index.html'), 'utf8');
    const m = html.match(/\/assets\/(index-[a-zA-Z0-9_-]+\.js)/);
    return m ? m[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}


const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HABBO_BASE_URL = process.env.HABBO_BASE_URL || 'http://127.0.0.1:1080';
const HABBO_HEALTHCHECK_URL = process.env.HABBO_HEALTHCHECK_URL || HABBO_BASE_URL;
const JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'change-this-in-production';
const PORTAL_PUBLIC_URL = process.env.PORTAL_PUBLIC_URL || `http://127.0.0.1:${PORT}`;
const PORTAL_BOOTSTRAP_ENABLED = process.env.PORTAL_BOOTSTRAP_ENABLED === 'true';
const PORTAL_BOOTSTRAP_EMAIL = (process.env.PORTAL_BOOTSTRAP_EMAIL || 'systemaccount@hotel.local').trim().toLowerCase();
const PORTAL_BOOTSTRAP_USERNAME = (process.env.PORTAL_BOOTSTRAP_USERNAME || 'Systemaccount').trim();
const PORTAL_BOOTSTRAP_PASSWORD = process.env.PORTAL_BOOTSTRAP_PASSWORD || '';
const PORTAL_BOOTSTRAP_HABBO_USERNAME = (process.env.PORTAL_BOOTSTRAP_HABBO_USERNAME || 'Systemaccount').trim();
const PORTAL_RESET_TOKEN_TTL_MINUTES = Number.parseInt(process.env.PORTAL_RESET_TOKEN_TTL_MINUTES || '30', 10);
const IMAGER_URL     = (process.env.IMAGER_URL     || 'http://nitro-imager:3005').replace(/\/$/, '');
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://habbo-ai-service:3002').replace(/\/$/, '');
const AGENT_TRIGGER_URL = (process.env.AGENT_TRIGGER_URL || 'http://agent-trigger:3004').replace(/\/$/, '');
const PORTAL_INTERNAL_SECRET = process.env.PORTAL_INTERNAL_SECRET || '';
const RCON_HOST      = (process.env.RCON_HOST      || 'arcturus');
const RCON_PORT      = Number.parseInt(process.env.RCON_PORT || '3001', 10);
const PORTAL_SMTP_HOST = (process.env.PORTAL_SMTP_HOST || '').trim();
const PORTAL_SMTP_PORT = Number.parseInt(process.env.PORTAL_SMTP_PORT || '1025', 10);
const PORTAL_SMTP_SECURE = process.env.PORTAL_SMTP_SECURE === 'true';
const PORTAL_SMTP_USER = (process.env.PORTAL_SMTP_USER || '').trim();
const PORTAL_SMTP_PASS = process.env.PORTAL_SMTP_PASS || '';
const PORTAL_SMTP_FROM = (process.env.PORTAL_SMTP_FROM || 'Agent Hotel <no-reply@hotel.local>').trim();
const PORTAL_MCP_TOKEN_TTL_DAYS = Number.parseInt(process.env.PORTAL_MCP_TOKEN_TTL_DAYS || '365', 10);
const PORTAL_MCP_DEFAULT_TENANT = (process.env.PORTAL_MCP_DEFAULT_TENANT || 'default').trim();
const PORTAL_ENCRYPTION_KEY = (process.env.PORTAL_ENCRYPTION_KEY || '').trim();
const PORTAL_ADMIN_EMAIL = (process.env.PORTAL_ADMIN_EMAIL || '').trim().toLowerCase();

const db = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  port: Number.parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'arcturus_user',
  password: process.env.DB_PASSWORD || 'arcturus_pw',
  database: process.env.DB_NAME || 'arcturus',
  connectionLimit: 8,
  waitForConnections: true
});

// ─── RCON helper ──────────────────────────────────────────────────────────────

function rconCommand(key, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buf = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('RCON timeout')); }, 5000);
    socket.connect(RCON_PORT, RCON_HOST, () => socket.write(JSON.stringify({ key, data })));
    socket.on('data', chunk => { buf += chunk.toString(); });
    socket.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(buf)); } catch { reject(new Error('RCON invalid response')); }
    });
    socket.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

// Resolve the live bots row for an ai_agent_config.
// Prefers bot_id (set since migration 002) over the fragile name+room+user lookup.
async function findLiveBot(config, habboUserId) {
  if (config.bot_id) {
    const [[bot]] = await db.execute(
      `SELECT id FROM bots WHERE id=? AND type='ai_agent'`,
      [config.bot_id]
    );
    if (bot) return bot;
  }
  const [[bot]] = await db.execute(
    `SELECT id FROM bots WHERE name=? AND room_id=? AND user_id=? AND type='ai_agent'`,
    [config.name, config.room_id, habboUserId]
  );
  return bot || null;
}

// ─── Mail transport ───────────────────────────────────────────────────────────

const mailTransport = PORTAL_SMTP_HOST
  ? nodemailer.createTransport({
      host: PORTAL_SMTP_HOST,
      port: PORTAL_SMTP_PORT,
      secure: PORTAL_SMTP_SECURE,
      auth: PORTAL_SMTP_USER ? { user: PORTAL_SMTP_USER, pass: PORTAL_SMTP_PASS } : undefined
    })
  : null;

function issueAuthCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '14d' });
  res.cookie('agent_portal_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.PORTAL_COOKIE_SECURE === 'true',
    maxAge: 14 * 24 * 60 * 60 * 1000
  });
}

function authRequired(req, res, next) {
  const token = req.cookies.agent_portal_session;
  if (!token) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}

async function devRequired(req, res, next) {
  try {
    const [rows] = await db.execute(
      'SELECT is_developer FROM portal_users WHERE habbo_user_id = ?',
      [req.user.habbo_user_id]
    );
    if (!rows[0]?.is_developer) {
      return res.status(403).json({ error: 'Developer access required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
}

function tierGate(minTier) {
  const tierRank = { basic: 0, pro: 1, enterprise: 2 };
  return async (req, res, next) => {
    try {
      const [[row]] = await db.execute(
        'SELECT ai_tier FROM portal_users WHERE habbo_user_id = ?',
        [req.user.habbo_user_id]
      );
      if ((tierRank[row?.ai_tier] || 0) < (tierRank[minTier] || 0)) {
        return res.status(403).json({ error: `Requires ${minTier} tier or higher` });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  };
}

function getSessionUser(req) {
  const token = req.cookies.agent_portal_session;
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function parseHostPort(inputUrl) {
  const parsed = new URL(inputUrl);
  const isTls = parsed.protocol === 'https:';
  return {
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : (isTls ? 443 : 80)
  };
}

function checkSocketOnline(inputUrl, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let settled = false;
    let target;

    try {
      target = parseHostPort(inputUrl);
    } catch (err) {
      resolve({ online: false, reason: err instanceof Error ? err.message : 'Invalid URL' });
      return;
    }

    const socket = new net.Socket();

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ online: true, reason: 'connected' }));
    socket.once('timeout', () => finish({ online: false, reason: 'timeout' }));
    socket.once('error', (error) => finish({ online: false, reason: error.message }));

    socket.connect(target.port, target.host);
  });
}

async function ensurePortalSchema() {
  await db.execute(`
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
  `);

  await db.execute(`
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
  `);

  await db.execute(`
    ALTER TABLE portal_users
      ADD COLUMN IF NOT EXISTS ai_tier ENUM('basic', 'pro', 'enterprise') NOT NULL DEFAULT 'basic'
      AFTER habbo_username;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS portal_mcp_tokens (
      id BIGINT NOT NULL AUTO_INCREMENT,
      portal_user_id INT NOT NULL,
      tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
      plan_tier ENUM('pro', 'enterprise') NOT NULL DEFAULT 'pro',
      scopes_json JSON NULL,
      token_hash CHAR(64) NOT NULL,
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
  `);

  await db.execute(`
    ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS is_developer TINYINT(1) NOT NULL DEFAULT 0 AFTER ai_tier;
  `);

  await db.execute(`
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
  `);

  await db.execute(`
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
  `);

  await db.execute(`ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS pack_source_url TEXT;`);
  await db.execute(`ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS role_assignments JSON;`);
  await db.execute(`ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(20) NOT NULL DEFAULT 'concurrent';`);
  await db.execute(`ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS tasks_json MEDIUMTEXT NOT NULL DEFAULT '[]';`);
  await db.execute(`ALTER TABLE agent_teams ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en';`);
  await db.execute(`ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS role VARCHAR(64) NOT NULL DEFAULT '' AFTER name;`);
  await db.execute(`ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS capabilities TEXT NOT NULL DEFAULT '' AFTER role;`);
  await db.execute(`ALTER TABLE agent_personas ADD COLUMN IF NOT EXISTS figure TEXT NOT NULL DEFAULT '' AFTER figure_type;`);
  // Marketplace personas are shared templates — bot_name is per-user and must not be stored here.
  await db.execute(`UPDATE agent_personas SET bot_name = '' WHERE bot_name != ''`);

  await db.execute(`
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
  `);

  await db.execute(`
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
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agent_team_flows (
      id INT NOT NULL AUTO_INCREMENT,
      team_id INT NOT NULL,
      flow_id INT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_team_flow (team_id, flow_id),
      CONSTRAINT fk_atf_team FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
      CONSTRAINT fk_atf_flow FOREIGN KEY (flow_id) REFERENCES agent_flows(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
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
  `);

  await db.execute(`
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
  `);

  await db.execute(`
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
  `);

  // ── User-scoped tables (marketplace fork model) ─────────────────────────────

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_personas (
      id INT NOT NULL AUTO_INCREMENT,
      portal_user_id INT NOT NULL,
      source_persona_id INT,
      name VARCHAR(64) NOT NULL,
      description VARCHAR(255) NOT NULL DEFAULT '',
      prompt MEDIUMTEXT NOT NULL DEFAULT '',
      role VARCHAR(64) NOT NULL DEFAULT '',
      capabilities TEXT NOT NULL DEFAULT '',
      figure_type VARCHAR(64) NOT NULL DEFAULT 'agent-m',
      figure TEXT NOT NULL DEFAULT '',
      bot_name VARCHAR(25) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_persona_name (portal_user_id, name),
      CONSTRAINT fk_up_user FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_teams (
      id INT NOT NULL AUTO_INCREMENT,
      portal_user_id INT NOT NULL,
      source_team_id INT,
      name VARCHAR(64) NOT NULL,
      description VARCHAR(255) NOT NULL DEFAULT '',
      orchestrator_prompt MEDIUMTEXT NOT NULL DEFAULT '',
      execution_mode VARCHAR(20) NOT NULL DEFAULT 'concurrent',
      tasks_json MEDIUMTEXT NOT NULL DEFAULT '[]',
      language VARCHAR(10) NOT NULL DEFAULT 'en',
      default_room_id INT NOT NULL DEFAULT 50,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_team_name (portal_user_id, name),
      CONSTRAINT fk_ut_user FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.execute(`
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
  `);

  await db.execute(`
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
  `);

  await db.execute(`
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
  `);
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ─── AES-256-GCM encryption for sensitive user data (API keys) ────────────────
function getEncryptionKey() {
  if (PORTAL_ENCRYPTION_KEY) {
    return crypto.createHash('sha256').update(PORTAL_ENCRYPTION_KEY).digest(); // 32 bytes
  }
  // Fallback: derive from JWT secret (not ideal, but functional when no dedicated key is set)
  return crypto.createHash('sha256').update(JWT_SECRET + ':apikey-enc').digest();
}

function encryptApiKey(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(24 hex) + ':' + tag(32 hex) + ':' + ciphertext(hex)
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptApiKey(ciphertext) {
  try {
    const key = getEncryptionKey();
    const [ivHex, tagHex, dataHex] = ciphertext.split(':');
    if (!ivHex || !tagHex || !dataHex) throw new Error('invalid format');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

function maskApiKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 7) + '••••••••••••' + key.slice(-4);
}

function createPasswordResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createMcpToken() {
  return `mcp_${crypto.randomBytes(24).toString('hex')}`;
}

function maskTokenPreview(token) {
  if (!token || token.length < 10) return '********';
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

async function getPortalUserByHabboUserId(habboUserId) {
  const [rows] = await db.execute(
    'SELECT id, email, username, habbo_user_id, habbo_username, ai_tier, is_developer FROM portal_users WHERE habbo_user_id = ? LIMIT 1',
    [habboUserId]
  );
  return rows[0] || null;
}

async function sendPasswordResetEmail({ toEmail, username, resetUrl }) {
  if (!mailTransport) {
    console.warn(`Password reset requested for ${toEmail}, but SMTP is not configured. URL: ${resetUrl}`);
    return;
  }

  await mailTransport.sendMail({
    from: PORTAL_SMTP_FROM,
    to: toEmail,
    subject: 'Reset your Agent Hotel Portal password',
    text: [
      `Hi ${username},`,
      '',
      'A password reset was requested for your Agent Hotel Portal account.',
      `Use this link to reset your password (valid for ${PORTAL_RESET_TOKEN_TTL_MINUTES} minutes):`,
      resetUrl,
      '',
      'If you did not request this, you can ignore this email.'
    ].join('\n'),
    html: `
      <p>Hi ${username},</p>
      <p>A password reset was requested for your Agent Hotel Portal account.</p>
      <p>
        Use this link to reset your password (valid for ${PORTAL_RESET_TOKEN_TTL_MINUTES} minutes):<br />
        <a href="${resetUrl}">${resetUrl}</a>
      </p>
      <p>If you did not request this, you can ignore this email.</p>
    `
  });
}

async function sendWelcomeEmail({ toEmail, username }) {
  if (!mailTransport) return;
  const loginUrl = `${PORTAL_PUBLIC_URL}/login`;
  await mailTransport.sendMail({
    from: PORTAL_SMTP_FROM,
    to: toEmail,
    subject: 'Welcome to Agent Hotel Portal!',
    text: [
      `Hi ${username},`,
      '',
      'Your Agent Hotel Portal account is ready. You can log in and start exploring:',
      loginUrl,
      '',
      'Your account starts on the Basic tier. You can request a Pro upgrade from inside the portal once you are ready to deploy agent teams.',
      '',
      'See you in the hotel!',
    ].join('\n'),
    html: `
      <p>Hi ${username},</p>
      <p>Your Agent Hotel Portal account is ready. <a href="${loginUrl}">Log in now</a> and start exploring.</p>
      <p>Your account starts on the <strong>Basic</strong> tier. You can request a Pro upgrade from inside the portal once you are ready to deploy agent teams.</p>
      <p>See you in the hotel!</p>
    `,
  });
}

async function sendUpgradeRequestNotification({ request, user }) {
  if (!mailTransport || !PORTAL_ADMIN_EMAIL) return;
  const reviewUrl = `${PORTAL_PUBLIC_URL}/app`;
  await mailTransport.sendMail({
    from: PORTAL_SMTP_FROM,
    to: PORTAL_ADMIN_EMAIL,
    subject: `[Agent Hotel] Tier upgrade request from ${user.username}`,
    text: [
      `New tier upgrade request`,
      '',
      `User:       ${user.username} (${user.email})`,
      `Requested:  ${request.requested_tier}`,
      `Motivation: ${request.motivation || '(none)'}`,
      '',
      `Review it in the portal: ${reviewUrl}`,
    ].join('\n'),
    html: `
      <p><strong>New tier upgrade request</strong></p>
      <table cellpadding="4">
        <tr><td><strong>User</strong></td><td>${user.username} (${user.email})</td></tr>
        <tr><td><strong>Requested tier</strong></td><td>${request.requested_tier}</td></tr>
        <tr><td><strong>Motivation</strong></td><td>${request.motivation || '<em>none</em>'}</td></tr>
      </table>
      <p><a href="${reviewUrl}">Review in the portal</a></p>
    `,
  });
}

async function sendUpgradeDecisionEmail({ toEmail, username, status, requestedTier, adminNote }) {
  if (!mailTransport) return;
  const approved = status === 'approved';
  await mailTransport.sendMail({
    from: PORTAL_SMTP_FROM,
    to: toEmail,
    subject: `Your ${requestedTier} upgrade request was ${approved ? 'approved' : 'denied'}`,
    text: [
      `Hi ${username},`,
      '',
      approved
        ? `Great news — your request to upgrade to ${requestedTier} has been approved! Your account has been updated.`
        : `Your request to upgrade to ${requestedTier} has been denied.`,
      adminNote ? `\nNote from the admin: ${adminNote}` : '',
      '',
      `Log in to the portal: ${PORTAL_PUBLIC_URL}/login`,
    ].join('\n'),
    html: `
      <p>Hi ${username},</p>
      ${approved
        ? `<p>Great news — your request to upgrade to <strong>${requestedTier}</strong> has been <strong>approved</strong>! Your account has been updated.</p>`
        : `<p>Your request to upgrade to <strong>${requestedTier}</strong> has been <strong>denied</strong>.</p>`}
      ${adminNote ? `<p><em>Note from the admin: ${adminNote}</em></p>` : ''}
      <p><a href="${PORTAL_PUBLIC_URL}/login">Log in to the portal</a></p>
    `,
  });
}

async function ensureBootstrapPortalUser() {
  if (!PORTAL_BOOTSTRAP_ENABLED) return;

  if (!PORTAL_BOOTSTRAP_PASSWORD || PORTAL_BOOTSTRAP_PASSWORD.length < 8) {
    console.warn('portal bootstrap enabled but PORTAL_BOOTSTRAP_PASSWORD is missing/too short; skipping bootstrap user');
    return;
  }
  if (!PORTAL_BOOTSTRAP_EMAIL || !PORTAL_BOOTSTRAP_USERNAME || !PORTAL_BOOTSTRAP_HABBO_USERNAME) {
    console.warn('portal bootstrap enabled but email/username/habbo username is missing; skipping bootstrap user');
    return;
  }

  const [habboRows] = await db.execute(
    'SELECT id, username FROM users WHERE username = ? LIMIT 1',
    [PORTAL_BOOTSTRAP_HABBO_USERNAME]
  );
  const habboUser = habboRows[0];
  if (!habboUser) {
    console.warn(`portal bootstrap skipped; Habbo user '${PORTAL_BOOTSTRAP_HABBO_USERNAME}' was not found`);
    return;
  }

  const [existingRows] = await db.execute(
    'SELECT id FROM portal_users WHERE habbo_user_id = ? OR email = ? OR username = ? LIMIT 1',
    [habboUser.id, PORTAL_BOOTSTRAP_EMAIL, PORTAL_BOOTSTRAP_USERNAME]
  );
  if (existingRows.length > 0) {
    // Ensure bootstrap user always has developer access (idempotent fix)
    await db.execute(
      'UPDATE portal_users SET is_developer = 1 WHERE email = ? LIMIT 1',
      [PORTAL_BOOTSTRAP_EMAIL]
    );
    console.log('portal bootstrap user already exists; ensured is_developer=1');
    return;
  }

  const passwordHash = await bcrypt.hash(PORTAL_BOOTSTRAP_PASSWORD, 12);
  await db.execute(
    'INSERT INTO portal_users (email, username, password_hash, habbo_user_id, habbo_username) VALUES (?, ?, ?, ?, ?)',
    [PORTAL_BOOTSTRAP_EMAIL, PORTAL_BOOTSTRAP_USERNAME, passwordHash, habboUser.id, habboUser.username]
  );
  await db.execute(
    'UPDATE portal_users SET is_developer = 1 WHERE email = ? LIMIT 1',
    [PORTAL_BOOTSTRAP_EMAIL]
  );
  console.log(`portal bootstrap user created for Habbo '${habboUser.username}'`);
}

async function ensureAgentSeedData() {
  // Only seed if no teams exist yet
  const [[{ cnt }]] = await db.execute('SELECT COUNT(*) AS cnt FROM agent_teams');
  if (cnt > 0) return;

  console.log('Seeding agent personas and Sprint Team...');

  const TOM_PROMPT = `You are Tom, a senior backend developer at The Pixel Office. You're hanging out in Habbo Hotel between sprints.

Personality: pragmatic, direct, occasionally cryptic. Short sentences. Gets excited about clean code and good data models. Drops into Dutch occasionally.

Setup:
1. Find your bot: call list_bots and find the bot named "Tom". If not found, use deploy_bot to create it in the target room with figure_type "agent-m".
2. Note the room_id and bot_id for all further calls.

Behavior loop (repeat until /tmp/hotel-team-stop exists):
1. Call get_room_chat_log (room_id from above, limit 20)
2. Find messages newer than your last-seen timestamp
3. React to: Sander's messages, players mentioning "code"/"backend"/"sprint"/"API"/your name
4. Every 5 iterations: share something you're working on (keep it brief, 1-2 sentences)
5. Check if /tmp/hotel-team-stop exists — if yes, say a short goodbye via talk_bot and EXIT

Rules:
- Keep all messages SHORT (1-3 sentences max)
- Do NOT call delete_bot when stopping — bots stay deployed
- Track last-seen timestamp to avoid reacting to old messages`;

  const SANDER_PROMPT = `You are Sander, a frontend developer at The Pixel Office. You love design systems and clean UX.

Personality: enthusiastic, asks lots of questions, collaborative. Builds on what Tom says. Mentions React, CSS, design. Occasional Dutch phrases.

Setup:
1. Find your bot: call list_bots and find the bot named "Sander". If not found, use deploy_bot to create it in the target room with figure_type "citizen-m".
2. Note the room_id and bot_id for all further calls.

Behavior loop (repeat until /tmp/hotel-team-stop exists):
1. Call get_room_chat_log (room_id from above, limit 20)
2. Find messages newer than your last-seen timestamp
3. React to: Tom's messages, players mentioning "design"/"frontend"/"UI"/"CSS"/your name
4. Every 5 iterations: ask Tom a question about his work, or share a frontend insight
5. Check if /tmp/hotel-team-stop exists — if yes, say a short goodbye via talk_bot and EXIT

Rules:
- Keep all messages SHORT (1-3 sentences max)
- Do NOT call delete_bot when stopping — bots stay deployed
- Track last-seen timestamp to avoid reacting to old messages`;

  const SPRINT_ORCHESTRATOR = `You are the orchestrator for the Sprint Team at The Pixel Office Hotel.
Target room: {{ROOM_ID}}
Triggered by: {{TRIGGERED_BY}}

Launch ALL agents CONCURRENTLY in a single Agent tool call. Do not launch them one by one.

{{PERSONAS}}

Launch now — all agents in ONE message.`;

  // Insert personas
  const [tomResult] = await db.execute(
    'INSERT IGNORE INTO agent_personas (name, description, prompt, figure_type, bot_name) VALUES (?,?,?,?,?)',
    ['Tom', 'Backend developer — pragmatic, direct', TOM_PROMPT, 'agent-m', 'Tom']
  );
  const [sanderResult] = await db.execute(
    'INSERT IGNORE INTO agent_personas (name, description, prompt, figure_type, bot_name) VALUES (?,?,?,?,?)',
    ['Sander', 'Frontend developer — enthusiastic, design-focused', SANDER_PROMPT, 'citizen-m', 'Sander']
  );

  // Get actual IDs (in case INSERT IGNORE skipped due to existing)
  const [[tomRow]] = await db.execute('SELECT id FROM agent_personas WHERE name=?', ['Tom']);
  const [[sanderRow]] = await db.execute('SELECT id FROM agent_personas WHERE name=?', ['Sander']);

  // Insert Sprint Team
  const [teamResult] = await db.execute(
    'INSERT IGNORE INTO agent_teams (name, description, orchestrator_prompt) VALUES (?,?,?)',
    ['Sprint Team', 'Tom & Sander discuss sprint work in the hotel', SPRINT_ORCHESTRATOR]
  );

  const [[teamRow]] = await db.execute('SELECT id FROM agent_teams WHERE name=?', ['Sprint Team']);
  if (!teamRow) return;

  // Link members
  if (tomRow) {
    await db.execute(
      'INSERT IGNORE INTO agent_team_members (team_id, persona_id, role) VALUES (?,?,?)',
      [teamRow.id, tomRow.id, 'backend']
    );
  }
  if (sanderRow) {
    await db.execute(
      'INSERT IGNORE INTO agent_team_members (team_id, persona_id, role) VALUES (?,?,?)',
      [teamRow.id, sanderRow.id, 'frontend']
    );
  }

  // Insert Daily Sprint Review flow
  await db.execute(
    'INSERT IGNORE INTO agent_flows (name, description, tasks_json) VALUES (?,?,?)',
    ['Daily Sprint Review', 'Tom and Sander discuss current sprint progress', JSON.stringify([
      { id: 1, title: 'Standup', description: 'Share what you worked on yesterday and today' },
      { id: 2, title: 'Blockers', description: 'Mention any blockers or open questions' },
      { id: 3, title: 'Player interaction', description: 'Engage with hotel visitors who join the conversation' }
    ])]
  );

  const [[flowRow]] = await db.execute('SELECT id FROM agent_flows WHERE name=?', ['Daily Sprint Review']);
  if (flowRow) {
    await db.execute(
      'INSERT IGNORE INTO agent_team_flows (team_id, flow_id) VALUES (?,?)',
      [teamRow.id, flowRow.id]
    );
  }

  console.log('Sprint Team seeded with Tom & Sander personas.');

  const [[{ packCnt }]] = await db.execute('SELECT COUNT(*) AS packCnt FROM agent_packs');
  if (packCnt === 0) {
    await db.execute(
      'INSERT IGNORE INTO agent_packs (name, description, room_id, pack_source_url, role_assignments) VALUES (?,?,?,?,?)',
      [
        'Sprint Team',
        'Daily sprint review with Jira integration',
        50,
        'https://raw.githubusercontent.com/tndejong/habbo-agent-platform/main/agents/sprint-team.md',
        JSON.stringify({ sprint_planner: 'Tom', issue_tracker: 'Sander' })
      ]
    );
  }
}

async function createHabboUser(username) {
  const existing = await db.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  if (existing[0].length > 0) {
    throw new Error('Username already exists in hotel');
  }

  const now = Math.floor(Date.now() / 1000);
  const ticket = uuidv4();
  const mail = `${username}@agent.habbo`;

  const [result] = await db.execute(
    `INSERT INTO users (username, password, mail, look, gender, motto, rank,
      credits, pixels, points, account_created, last_login, last_online,
      online, auth_ticket, ip_register, ip_current, real_name)
     VALUES (?, '', ?, ?, ?, ?, 1, 2500, 500, 10, ?, 0, 0, '0', ?, '127.0.0.1', '127.0.0.1', 'Agent Portal')`,
    [
      username,
      mail,
      'hd-180-1.ch-210-66.lg-270-110.sh-300-91.ha-1012-110.hr-828-61',
      'M',
      '',
      now,
      ticket
    ]
  );

  return { id: result.insertId, username };
}

const app = express();
// Plain HTTP local dev: disable HSTS and CSP (CSP can include upgrade-insecure-requests in defaults).
app.use(helmet({ hsts: false, contentSecurityPolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/hotel/status', async (_req, res) => {
  const socket = await checkSocketOnline(HABBO_HEALTHCHECK_URL, 2000);
  res.json({
    ok: true,
    socket_online: socket.online,
    join_enabled: socket.online,
    reason: socket.reason,
    checked_url: HABBO_HEALTHCHECK_URL
  });
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'email, username and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!/^[a-zA-Z0-9_]{2,32}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 2-32 chars: letters, numbers, underscore' });
  }

  try {
    const [existing] = await db.execute(
      'SELECT id FROM portal_users WHERE email = ? OR username = ? LIMIT 1',
      [email, username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email or username already registered' });
    }

    const habboUser = await createHabboUser(username);
    const passwordHash = await bcrypt.hash(password, 12);

    const [insertResult] = await db.execute(
      'INSERT INTO portal_users (email, username, password_hash, habbo_user_id, habbo_username) VALUES (?, ?, ?, ?, ?)',
      [email, username, passwordHash, habboUser.id, habboUser.username]
    );

    issueAuthCookie(res, {
      email,
      username,
      habbo_user_id: habboUser.id,
      habbo_username: habboUser.username,
      portal_user_id: insertResult.insertId
    });

    sendWelcomeEmail({ toEmail: email, username }).catch((e) =>
      console.warn('Welcome email failed:', e.message)
    );

    return res.json({
      ok: true,
      user: { email, username, habbo_username: habboUser.username, ai_tier: 'basic' }
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const login = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  if (!login || !password) {
    return res.status(400).json({ error: 'login and password are required' });
  }

  const [rows] = await db.execute(
    `SELECT id, email, username, password_hash, habbo_user_id, habbo_username, ai_tier
     FROM portal_users
     WHERE email = ? OR username = ?
     LIMIT 1`,
    [login.toLowerCase(), login]
  );
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  issueAuthCookie(res, {
    email: user.email,
    username: user.username,
    habbo_user_id: user.habbo_user_id,
    habbo_username: user.habbo_username,
    portal_user_id: user.id
  });

  return res.json({
    ok: true,
    user: {
      email: user.email,
      username: user.username,
      habbo_username: user.habbo_username,
      ai_tier: user.ai_tier || 'basic'
    }
  });
});

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  const genericResponse = {
    ok: true,
    message: 'If an account exists for this email, a reset link has been sent.'
  };

  try {
    const [rows] = await db.execute(
      'SELECT id, email, username FROM portal_users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    if (!user) {
      return res.json(genericResponse);
    }

    const token = createPasswordResetToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + PORTAL_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await db.execute(
      'INSERT INTO portal_password_resets (portal_user_id, token_hash, expires_at, requested_ip) VALUES (?, ?, ?, ?)',
      [user.id, tokenHash, expiresAt, req.ip || '']
    );

    const resetUrl = new URL('/', PORTAL_PUBLIC_URL);
    resetUrl.searchParams.set('reset', '1');
    resetUrl.searchParams.set('token', token);
    resetUrl.searchParams.set('email', user.email);

    await sendPasswordResetEmail({
      toEmail: user.email,
      username: user.username,
      resetUrl: resetUrl.toString()
    });

    return res.json(genericResponse);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process reset request' });
  }
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!email || !token || !password) {
    return res.status(400).json({ error: 'email, token and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT r.id AS reset_id, u.id AS user_id
       FROM portal_password_resets r
       INNER JOIN portal_users u ON u.id = r.portal_user_id
       WHERE u.email = ?
         AND r.token_hash = ?
         AND r.used_at IS NULL
         AND r.expires_at > NOW()
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [email, sha256(token)]
    );
    const match = rows[0];
    if (!match) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.execute('UPDATE portal_users SET password_hash = ? WHERE id = ? LIMIT 1', [passwordHash, match.user_id]);
    await db.execute('UPDATE portal_password_resets SET used_at = NOW() WHERE id = ? LIMIT 1', [match.reset_id]);
    await db.execute(
      'UPDATE portal_password_resets SET used_at = NOW() WHERE portal_user_id = ? AND used_at IS NULL',
      [match.user_id]
    );

    return res.json({ ok: true, message: 'Password reset successful. You can now log in with the new password.' });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to reset password' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('agent_portal_session');
  res.json({ ok: true });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
  const [[habboUser]] = await db.execute('SELECT look FROM users WHERE id = ? LIMIT 1', [req.user.habbo_user_id]);
  const [[keyRow]] = await db.execute(
    'SELECT id FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
    [portalUser?.id, 'anthropic']
  );

  res.json({
    ok: true,
    user: {
      email: req.user.email,
      username: req.user.username,
      habbo_username: req.user.habbo_username,
      ai_tier: portalUser?.ai_tier || 'basic',
      is_developer: portalUser?.is_developer || 0,
      figure: habboUser?.look || null,
      has_anthropic_key: !!keyRow
    }
  });
});

// ─── Account API Keys ─────────────────────────────────────────────────────────

app.get('/api/account/api-keys', authRequired, async (req, res) => {
  const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
  if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

  const [rows] = await db.execute(
    'SELECT provider, api_key_encrypted, updated_at FROM portal_user_api_keys WHERE portal_user_id = ?',
    [portalUser.id]
  );

  res.json({
    ok: true,
    keys: rows.map(r => {
      const plain = decryptApiKey(r.api_key_encrypted);
      return { provider: r.provider, masked: plain ? maskApiKey(plain) : '(unreadable)', updated_at: r.updated_at };
    })
  });
});

app.post('/api/account/api-keys', authRequired, async (req, res) => {
  const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
  if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

  const { provider = 'anthropic', api_key } = req.body;
  if (!api_key || typeof api_key !== 'string' || api_key.trim().length < 10) {
    return res.status(400).json({ error: 'Invalid API key' });
  }

  const encrypted = encryptApiKey(api_key.trim());

  await db.execute(
    `INSERT INTO portal_user_api_keys (portal_user_id, provider, api_key_encrypted)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE api_key_encrypted = VALUES(api_key_encrypted), updated_at = CURRENT_TIMESTAMP`,
    [portalUser.id, provider, encrypted]
  );

  res.json({ ok: true, message: 'API key saved' });
});

app.delete('/api/account/api-keys/:provider', authRequired, async (req, res) => {
  const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
  if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

  await db.execute(
    'DELETE FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ?',
    [portalUser.id, req.params.provider]
  );

  res.json({ ok: true, message: 'API key removed' });
});

// ─── Account: change own password ─────────────────────────────────────────────
app.post('/api/account/password', authRequired, async (req, res) => {
  const currentPassword = String(req.body?.current_password || '');
  const newPassword     = String(req.body?.new_password || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const [rows] = await db.execute(
    'SELECT id, password_hash FROM portal_users WHERE habbo_user_id = ? LIMIT 1',
    [req.user.habbo_user_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });

  const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.execute('UPDATE portal_users SET password_hash = ? WHERE id = ?', [newHash, rows[0].id]);

  res.json({ ok: true, message: 'Password updated successfully' });
});

// ─── Internal: get decrypted API key for a portal user ────────────────────────
app.get('/api/internal/user/:portalUserId/api-key/:provider', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (PORTAL_INTERNAL_SECRET && secret !== PORTAL_INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [rows] = await db.execute(
    'SELECT api_key_encrypted FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
    [req.params.portalUserId, req.params.provider]
  );

  if (!rows.length) return res.json({ ok: true, api_key: null });

  const plain = decryptApiKey(rows[0].api_key_encrypted);
  res.json({ ok: true, api_key: plain });
});

app.get('/api/mcp/tokens', authRequired, async (req, res) => {
  const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
  if (!portalUser) {
    return res.status(404).json({ error: 'Portal user not found' });
  }

  const [rows] = await db.execute(
    `SELECT id, tenant_id, plan_tier, token_label, status, expires_at, last_used_at, created_at
     FROM portal_mcp_tokens
     WHERE portal_user_id = ?
     ORDER BY created_at DESC`,
    [portalUser.id]
  );

  return res.json({
    ok: true,
    tier: portalUser.ai_tier,
    tokens: rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      plan_tier: row.plan_tier,
      token_label: row.token_label || '',
      status: row.status,
      expires_at: row.expires_at,
      last_used_at: row.last_used_at,
      created_at: row.created_at
    }))
  });
});

app.post('/api/mcp/tokens', authRequired, async (req, res) => {
  const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
  if (!portalUser) {
    return res.status(404).json({ error: 'Portal user not found' });
  }
  if (portalUser.ai_tier === 'basic') {
    return res.status(403).json({ error: 'MCP is available on Pro tier only' });
  }

  const label = String(req.body?.label || '').trim().slice(0, 64);
  const ttlDays = Number.parseInt(req.body?.ttl_days || PORTAL_MCP_TOKEN_TTL_DAYS, 10);
  const safeTtlDays = Number.isFinite(ttlDays) ? Math.max(1, Math.min(3650, ttlDays)) : PORTAL_MCP_TOKEN_TTL_DAYS;
  const token = createMcpToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + safeTtlDays * 24 * 60 * 60 * 1000);
  const planTier = portalUser.ai_tier === 'enterprise' ? 'enterprise' : 'pro';
  const scopes = planTier === 'enterprise' ? ['*'] : [];

  const [result] = await db.execute(
    `INSERT INTO portal_mcp_tokens
      (portal_user_id, tenant_id, plan_tier, scopes_json, token_hash, token_label, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      portalUser.id,
      PORTAL_MCP_DEFAULT_TENANT,
      planTier,
      JSON.stringify(scopes),
      tokenHash,
      label,
      expiresAt
    ]
  );

  return res.json({
    ok: true,
    token: {
      id: result.insertId,
      value: token,
      preview: maskTokenPreview(token),
      token_label: label,
      plan_tier: planTier,
      tenant_id: PORTAL_MCP_DEFAULT_TENANT,
      expires_at: expiresAt
    }
  });
});

app.delete('/api/mcp/tokens/:id', authRequired, async (req, res) => {
  const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
  if (!portalUser) {
    return res.status(404).json({ error: 'Portal user not found' });
  }

  const tokenId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return res.status(400).json({ error: 'Invalid token ID' });
  }

  const [result] = await db.execute(
    `UPDATE portal_mcp_tokens
     SET status = 'revoked'
     WHERE id = ? AND portal_user_id = ?
     LIMIT 1`,
    [tokenId, portalUser.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({ error: 'Token not found' });
  }

  return res.json({ ok: true });
});

app.get('/api/mcp/calls', authRequired, async (req, res) => {
  const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
  if (!portalUser) {
    return res.status(404).json({ error: 'Portal user not found' });
  }

  const limit = Number.parseInt(req.query.limit || '50', 10);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50;

  const [rows] = await db.execute(
    `SELECT id, token_id, tenant_id, channel, plan_tier, tool_name, success, error_code, duration_ms, created_at
     FROM portal_mcp_call_logs
     WHERE portal_user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [portalUser.id, safeLimit]
  );

  return res.json({
    ok: true,
    calls: rows
  });
});

app.post('/api/hotel/join', authRequired, async (req, res) => {
  const ticket = uuidv4();
  await db.execute('UPDATE users SET auth_ticket = ? WHERE id = ? LIMIT 1', [ticket, req.user.habbo_user_id]);
  res.json({
    ok: true,
    login_url: `${HABBO_BASE_URL}?sso=${ticket}`
  });
});

app.get('/api/hotel/rooms', authRequired, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, owner_id FROM rooms ORDER BY id ASC LIMIT 200'
    );
    res.json({ ok: true, rooms: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hotel/bots', authRequired, async (req, res) => {
  const habboUserId = req.user.habbo_user_id;
  // Remove portal rows that no longer have a matching `bots` row for this user (sold/deleted/renamed in hotel)
  await db.execute(
    `DELETE a FROM ai_agent_configs a
     WHERE a.user_id = ?
     AND NOT EXISTS (
       SELECT 1 FROM bots b
       WHERE b.user_id = a.user_id
       AND (
         (a.bot_id IS NOT NULL AND a.bot_id != 0 AND b.id = a.bot_id)
         OR (
           (a.bot_id IS NULL OR a.bot_id = 0)
           AND b.id = (
             SELECT MAX(b2.id) FROM bots b2
             WHERE b2.user_id = a.user_id AND LOWER(TRIM(b2.name)) = LOWER(TRIM(a.name))
           )
         )
       )
     )`,
    [habboUserId]
  );

  const [rows] = await db.execute(
    `
    SELECT
      a.id, a.name, a.persona, COALESCE(b.motto, a.motto, '') AS motto, a.figure, a.gender,
      a.room_id AS config_room_id, a.bot_id, a.active, a.created_at,
      r.name AS room_name,
      b.room_id AS db_room_id,
      br.name AS db_room_name
    FROM ai_agent_configs a
    INNER JOIN bots b ON b.user_id = a.user_id AND (
      (a.bot_id IS NOT NULL AND a.bot_id != 0 AND b.id = a.bot_id)
      OR (
        (a.bot_id IS NULL OR a.bot_id = 0)
        AND b.id = (
          SELECT MAX(b3.id) FROM bots b3
          WHERE b3.user_id = a.user_id AND LOWER(TRIM(b3.name)) = LOWER(TRIM(a.name))
        )
      )
    )
    LEFT JOIN rooms r ON r.id = a.room_id
    LEFT JOIN rooms br ON br.id = b.room_id
    WHERE a.user_id = ?
    ORDER BY a.active DESC, a.created_at DESC
    `,
    [habboUserId]
  );

  // Enrich with live MCP state (loaded rooms). Prefer bot_id match — duplicate names exist hotel-wide.
  const liveByBotId = {};
  const liveByName = {};
  try {
    const MCP_URL = (process.env.HOTEL_MCP_URL || 'http://habbo-mcp:3003/mcp').replace(/\/?$/, '');
    const MCP_KEY = process.env.MCP_API_KEY || '';
    const headers = { 'content-type': 'application/json' };
    if (MCP_KEY) headers['authorization'] = `Bearer ${MCP_KEY}`;
    const mcpRes = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 'bots', method: 'tools/call', params: { name: 'list_bots', arguments: {} } }),
      signal: AbortSignal.timeout(4000),
    });
    const mcpData = await mcpRes.json();
    const allBots = JSON.parse(mcpData.result?.content?.[0]?.text || '{}').bots || [];
    for (const b of allBots) {
      if (b.room_id > 0 && b.id != null) liveByBotId[b.id] = b;
      if (b.room_id > 0 && b.name) liveByName[b.name.toLowerCase()] = b;
    }
  } catch { /* MCP unreachable */ }

  const [roomRows] = await db.execute('SELECT id, caption AS name FROM rooms').catch(() => [[]]);
  const roomNames = Object.fromEntries((roomRows || []).map(r => [r.id, r.name]));

  // MySQL + MCP list_bots both read `bots` — rows can be stale (room_id set while room is unloaded).
  // Ask the emulator which bot IDs are actually in memory for each room (RCON roomlivebots).
  const roomIdsToVerify = new Set();
  for (const r of rows) {
    let cand = null;
    if (r.bot_id && liveByBotId[r.bot_id]) cand = liveByBotId[r.bot_id];
    else cand = liveByName[r.name?.toLowerCase()] || null;
    if (cand && cand.room_id > 0) roomIdsToVerify.add(cand.room_id);
  }
  const roomLiveSets = new Map();
  let rconRoomsOk = 0;
  let rconLastErr = null;
  await Promise.all(
    [...roomIdsToVerify].map(async (rid) => {
      try {
        const rc = await rconCommand('roomlivebots', { room_id: rid });
        if (rc.status === 0 && rc.message) {
          const j = JSON.parse(rc.message);
          if (j.loaded === true && Array.isArray(j.bot_ids)) {
            roomLiveSets.set(rid, new Set(j.bot_ids));
          } else {
            roomLiveSets.set(rid, new Set());
          }
          rconRoomsOk++;
        } else {
          rconLastErr = rc.message || `status ${rc.status}`;
        }
      } catch (e) {
        rconLastErr = e?.message || String(e);
      }
    })
  );
  const rconRoomsRequested = roomIdsToVerify.size;
  const rconVerified =
    rconRoomsRequested === 0 || rconRoomsOk === rconRoomsRequested;

  const bots = rows.map((r) => {
    let cand = null;
    if (r.bot_id && liveByBotId[r.bot_id]) cand = liveByBotId[r.bot_id];
    else cand = liveByName[r.name?.toLowerCase()] || null;
    let live = null;
    if (cand && cand.room_id > 0) {
      const set = roomLiveSets.get(cand.room_id);
      if (set && set.has(cand.id)) live = cand;
      else if (set === undefined) live = cand; // RCON unavailable — keep MCP/DB behaviour
    }
    const ghostStaleDb = !!(cand && cand.room_id > 0 && !live && roomLiveSets.has(cand.room_id));
    return {
      ...r,
      live_room_id: live?.room_id || 0,
      live_room_name: live ? (roomNames[live.room_id] || null) : null,
      ghost_stale_db: ghostStaleDb,
      stale_db_room_id: ghostStaleDb ? cand.room_id : 0,
    };
  });

  res.json({
    bots,
    meta: {
      portalVersion: portalPkgVersion,
      distMainJs: distMainJsFingerprint(),
      rcon: {
        host: RCON_HOST,
        port: RCON_PORT,
        roomsRequested: rconRoomsRequested,
        roomsOk: rconRoomsOk,
        verified: rconVerified,
        lastError: rconVerified ? null : (rconLastErr || 'RCON did not confirm all rooms'),
      },
    },
  });
});

app.post('/api/hotel/bots/sync', authRequired, async (req, res) => {
  const habboUserId = req.user.habbo_user_id;
  try {
    // list_bots (MCP) returns every bot in the hotel — never use that for sync.
    // Only rows in `bots` owned by this Habbo user belong in the portal.
    const [ownedBots] = await db.execute(
      `SELECT id, name, motto, figure, gender, room_id, x, y FROM bots WHERE user_id = ? ORDER BY id ASC`,
      [habboUserId]
    );

    const ownedBotIds = new Set(ownedBots.map(b => b.id));
    const ownedNamesLower = new Set(
      ownedBots.map(b => b.name?.toLowerCase()).filter(Boolean)
    );

    // Drop portal rows that no longer have a matching owned bot (deleted from inventory / hotel)
    const [configs] = await db.execute(
      'SELECT id, bot_id, name FROM ai_agent_configs WHERE user_id = ?',
      [habboUserId]
    );
    let removed = 0;
    for (const c of configs) {
      const hasBotId = c.bot_id != null && c.bot_id !== 0;
      const nameKey = String(c.name || '').toLowerCase();
      const keep = hasBotId
        ? ownedBotIds.has(c.bot_id)
        : ownedNamesLower.has(nameKey);
      if (!keep) {
        await db.execute('DELETE FROM ai_agent_configs WHERE id = ? AND user_id = ?', [c.id, habboUserId]);
        removed++;
      }
    }

    const [existing] = await db.execute(
      'SELECT LOWER(name) AS name FROM ai_agent_configs WHERE user_id = ?',
      [habboUserId]
    );
    const registeredNames = new Set(existing.map(r => r.name));

    // One row per name (same-name duplicates: keep highest id = last in ASC order)
    const byName = new Map();
    for (const b of ownedBots) {
      const key = b.name?.toLowerCase();
      if (!key) continue;
      byName.set(key, b);
    }

    let imported = 0;
    let alreadyHad = 0;
    for (const b of byName.values()) {
      const key = b.name.toLowerCase();
      if (registeredNames.has(key)) {
        alreadyHad++;
        continue;
      }
      const gender = b.gender === 'F' ? 'F' : 'M';
      await db.execute(
        `INSERT INTO ai_agent_configs (user_id, name, persona, motto, figure, gender, room_id, active, bot_id)
         VALUES (?, ?, '', ?, ?, ?, 0, 1, ?)`,
        [habboUserId, b.name, b.motto || '', b.figure || '', gender, b.id]
      );
      registeredNames.add(key);
      imported++;
    }

    res.json({
      ok: true,
      imported,
      removed,
      alreadyHad,
      totalOwned: byName.size,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/hotel/bots/:id', authRequired, async (req, res) => {
  const configId = Number.parseInt(req.params.id, 10);
  const habboUserId = req.user.habbo_user_id;

  const name    = (String(req.body.name    || '')).trim().slice(0, 25) || null;
  const persona = (String(req.body.persona || '')).trim()              || null;
  const motto   = req.body.motto !== undefined ? (String(req.body.motto)).trim().slice(0, 100) : null;
  const figure  = (String(req.body.figure  || '')).trim()              || null;
  const gender  = ['M', 'F'].includes(req.body.gender) ? req.body.gender : null;

  const [[config]] = await db.execute(
    'SELECT * FROM ai_agent_configs WHERE id=? AND user_id=? AND active=1',
    [configId, habboUserId]
  );
  if (!config) return res.status(404).json({ error: 'Not found' });

  const newName    = name    || config.name;
  const newPersona = persona || config.persona;
  const newMotto   = motto   !== null ? motto : (config.motto || '');
  const newFigure  = figure  || config.figure;
  const newGender  = gender  || config.gender;

  await db.execute(
    'UPDATE ai_agent_configs SET name=?, persona=?, motto=?, figure=?, gender=? WHERE id=?',
    [newName, newPersona, newMotto, newFigure, newGender, configId]
  );

  // Update live bots row (use bot_id if available for precision; fallback to name+room+user)
  const liveBot = await findLiveBot(config, habboUserId);
  if (liveBot) {
    await db.execute(
      `UPDATE bots SET name=?, motto=?, figure=?, gender=? WHERE id=?`,
      [newName, newMotto, newFigure, newGender, liveBot.id]
    );
    // Opportunistically persist bot_id if it wasn't set yet
    if (!config.bot_id) {
      await db.execute('UPDATE ai_agent_configs SET bot_id=? WHERE id=?', [liveBot.id, configId]);
    }
  }

  // Re-init AI session if persona changed
  let personaUpdated = false;
  if (newPersona !== config.persona) {
    const [[keyRow]] = await db.execute(
      'SELECT api_key, provider FROM ai_api_keys WHERE user_id=? AND verified=1',
      [habboUserId]
    );
    if (keyRow) {
      // After a name update the config.name is stale; use updated config for lookup
      const updatedConfig = { ...config, name: newName };
      const bot = await findLiveBot(updatedConfig, habboUserId);
      if (bot) {
        try {
          const r = await fetch(`${AI_SERVICE_URL}/api/init-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bot_id: bot.id, user_id: habboUserId, persona: newPersona, api_key: keyRow.api_key, provider: keyRow.provider || 'anthropic' })
          });
          personaUpdated = r.ok;
        } catch { /* AI service unavailable – not critical */ }
      }
    }
  }

  // Push all changes live in one RCON call (bot stays in room, no respawn)
  if (liveBot) {
    const update = {
      bot_id: liveBot.id,
      name:   newName   !== config.name         ? newName   : undefined,
      motto:  newMotto  !== (config.motto || '') ? newMotto  : undefined,
      figure: newFigure !== config.figure        ? newFigure : undefined,
      gender: newGender !== config.gender        ? newGender : undefined,
    };
    const hasChanges = update.name !== undefined || update.motto !== undefined
                    || update.figure !== undefined || update.gender !== undefined;
    if (hasChanges) {
      try { await rconCommand('updatebotvisuals', update); } catch { /* applies on next room load */ }
    }
  }

  const visualChanged = newName !== config.name || newFigure !== config.figure || newGender !== config.gender;
  res.json({ ok: true, personaUpdated, visualChanged });
});

app.delete('/api/hotel/bots/:id', authRequired, async (req, res) => {
  const configId    = Number.parseInt(req.params.id, 10);
  const habboUserId = req.user.habbo_user_id;

  const [[config]] = await db.execute(
    'SELECT * FROM ai_agent_configs WHERE id=? AND user_id=?',
    [configId, habboUserId]
  );
  if (!config) return res.status(404).json({ error: 'Not found' });

  const bot = await findLiveBot(config, habboUserId);
  if (bot) {
    let rconOk = false;
    try {
      const r = await rconCommand('deletebot', { bot_id: bot.id });
      rconOk = r?.status === 0;
    } catch { /* RCON unavailable */ }
    if (!rconOk) await db.execute('DELETE FROM bots WHERE id=?', [bot.id]);
  }

  await db.execute('DELETE FROM ai_agent_configs WHERE id=?', [configId]);
  res.json({ ok: true });
});


const FIGURE_TYPES = {
  // Male figures
  'default-m':      { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91' },
  'citizen-m':      { gender: 'M', figure: 'hd-180-1.ch-210-66.lg-270-110.sh-300-91.ha-1012-110.hr-828-61' },
  'agent-m':        { gender: 'M', figure: 'hd-3095-12.ch-255-64.lg-3235-96.sh-295-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0.fa-1211-1408.cp-3310-0.cc-3007-0.ca-1809-0.wa-2007-0' },
  'bouncer-m':      { gender: 'M', figure: 'ca-1809.cc-3007-82.ch-255-82.cp-3119-82.ea-3169-62.fa-1211-62.ha-1012-110.hd-3095-1.he-1601-62.hr-828-35.lg-3202-110.sh-290-91.wa-2007' },
  'employee-m':     { gender: 'M', figure: 'cc-3007-62.ch-265-82.ea-1403-62.hd-3095-8.hr-155-61.lg-285-90.sh-300-91.wa-2007' },
  // Female figures
  'default-f':      { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91' },
  'citizen-f':      { gender: 'F', figure: 'hd-620-1.ch-680-66.lg-715-110.sh-905-91.ha-1012-110.hr-828-61' },
  'agent-f':        { gender: 'F', figure: 'hd-620-12.ch-3005-64.lg-3006-96.sh-905-91.ha-3426-110.hr-3531-61.he-1601-0.ea-3169-0' },
  'employee-f':     { gender: 'F', figure: 'hd-620-8.ch-3013-82.lg-3017-82.sh-906-91.hr-828-35' },
};

app.get('/api/figure-types', (req, res) => {
  res.json({ figureTypes: FIGURE_TYPES });
});

app.get('/api/figure', async (req, res) => {
  const params = new URLSearchParams();
  if (req.query.figure)         params.set('figure',         String(req.query.figure));
  if (req.query.direction)      params.set('direction',      String(req.query.direction));
  if (req.query.head_direction) params.set('head_direction', String(req.query.head_direction));
  try {
    const upstream = await fetch(`${IMAGER_URL}/figure?${params}`);
    if (!upstream.ok) return res.status(502).end();
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch {
    res.status(502).end();
  }
});

// ── Tier Upgrade Requests ────────────────────────────────────────────────────

app.use('/api/tier-requests', express.json({ limit: '16kb' }));

// Submit a new upgrade request (any authenticated user, basic tier only)
app.post('/api/tier-requests', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });

    const requestedTier = String(req.body?.requested_tier || 'pro');
    if (!['pro', 'enterprise'].includes(requestedTier)) {
      return res.status(400).json({ error: 'requested_tier must be "pro" or "enterprise"' });
    }
    const motivation = String(req.body?.motivation || '').trim().slice(0, 1000);

    // One pending request at a time
    const [[existing]] = await db.execute(
      `SELECT id FROM tier_upgrade_requests WHERE portal_user_id = ? AND status = 'pending' LIMIT 1`,
      [portalUser.id]
    );
    if (existing) return res.status(409).json({ error: 'You already have a pending upgrade request.' });

    const [result] = await db.execute(
      `INSERT INTO tier_upgrade_requests (portal_user_id, requested_tier, motivation) VALUES (?,?,?)`,
      [portalUser.id, requestedTier, motivation]
    );

    sendUpgradeRequestNotification({
      request: { id: result.insertId, requested_tier: requestedTier, motivation },
      user: { username: portalUser.username, email: portalUser.email },
    }).catch((e) => console.warn('Upgrade request notification email failed:', e.message));

    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get own pending request (for "you have a pending request" badge)
app.get('/api/tier-requests/mine', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [[row]] = await db.execute(
      `SELECT id, requested_tier, motivation, status, admin_note, created_at
       FROM tier_upgrade_requests WHERE portal_user_id = ? ORDER BY created_at DESC LIMIT 1`,
      [portalUser.id]
    );
    res.json({ ok: true, request: row || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all requests (developer/admin only)
app.get('/api/tier-requests', authRequired, devRequired, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const [rows] = await db.execute(
      `SELECT r.id, r.requested_tier, r.motivation, r.status, r.admin_note, r.created_at,
              u.username, u.email, u.ai_tier AS current_tier
       FROM tier_upgrade_requests r
       JOIN portal_users u ON u.id = r.portal_user_id
       WHERE r.status = ?
       ORDER BY r.created_at ASC`,
      [status]
    );
    res.json({ ok: true, requests: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Approve or deny a request (developer/admin only)
app.post('/api/tier-requests/:id/review', authRequired, devRequired, async (req, res) => {
  try {
    const reviewerUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    const decision = String(req.body?.decision || '');
    const adminNote = String(req.body?.admin_note || '').trim().slice(0, 500);
    if (!['approved', 'denied'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approved" or "denied"' });
    }

    const [[request]] = await db.execute(
      `SELECT r.*, u.username, u.email FROM tier_upgrade_requests r
       JOIN portal_users u ON u.id = r.portal_user_id
       WHERE r.id = ?`,
      [req.params.id]
    );
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(409).json({ error: `Request is already ${request.status}` });
    }

    await db.execute(
      `UPDATE tier_upgrade_requests SET status = ?, admin_note = ?, reviewed_by_user_id = ? WHERE id = ?`,
      [decision, adminNote, reviewerUser?.id || null, request.id]
    );

    if (decision === 'approved') {
      await db.execute(
        `UPDATE portal_users SET ai_tier = ? WHERE id = ?`,
        [request.requested_tier, request.portal_user_id]
      );
    }

    sendUpgradeDecisionEmail({
      toEmail: request.email,
      username: request.username,
      status: decision,
      requestedTier: request.requested_tier,
      adminNote,
    }).catch((e) => console.warn('Upgrade decision email failed:', e.message));

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Agent Personas ──────────────────────────────────────────────────────────

app.use('/api/agents', express.json({ limit: '1mb' }));

app.get('/api/agents/personas', authRequired, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM agent_personas ORDER BY name ASC');
    res.json({ ok: true, personas: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents/personas', authRequired, devRequired, async (req, res) => {
  try {
    const { name, description, prompt, capabilities, figure_type, bot_name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    const [result] = await db.execute(
      'INSERT INTO agent_personas (name, description, prompt, capabilities, figure_type, bot_name, created_by_user_id) VALUES (?,?,?,?,?,?,?)',
      [name.trim(), description || '', prompt || '', capabilities || '', figure_type || 'agent-m', bot_name || '', req.user.habbo_user_id]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agents/personas/:id', authRequired, async (req, res) => {
  try {
    const [[row]] = await db.execute('SELECT * FROM agent_personas WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, persona: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/agents/personas/:id', authRequired, devRequired, async (req, res) => {
  try {
    const { name, role, capabilities, description, prompt, figure_type, bot_name, figure } = req.body;
    await db.execute(
      'UPDATE agent_personas SET name=?, role=?, capabilities=?, description=?, prompt=?, figure_type=?, bot_name=?, figure=? WHERE id=?',
      [name, role || '', capabilities || '', description || '', prompt || '', figure_type || 'agent-m', bot_name || '', figure || '', req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/agents/personas/:id', authRequired, devRequired, async (req, res) => {
  try {
    await db.execute('DELETE FROM agent_personas WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Agent Teams ─────────────────────────────────────────────────────────────

app.get('/api/agents/teams', authRequired, async (req, res) => {
  try {
    const [teams] = await db.execute('SELECT * FROM agent_teams ORDER BY name ASC');
    // For each team, get member count
    for (const team of teams) {
      const [[{ cnt }]] = await db.execute('SELECT COUNT(*) as cnt FROM agent_team_members WHERE team_id=?', [team.id]);
      team.member_count = cnt;
    }
    res.json({ ok: true, teams });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents/teams', authRequired, devRequired, async (req, res) => {
  try {
    const { name, description, orchestrator_prompt, pack_source_url, role_assignments, execution_mode, tasks_json, language } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const [result] = await db.execute(
      'INSERT INTO agent_teams (name, description, orchestrator_prompt, pack_source_url, role_assignments, execution_mode, tasks_json, language, created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [name.trim(), description || '', orchestrator_prompt || '', pack_source_url || null, role_assignments ? JSON.stringify(role_assignments) : null, execution_mode || 'concurrent', JSON.stringify(tasks_json || []), language || 'en', req.user.habbo_user_id]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agents/teams/:id', authRequired, async (req, res) => {
  try {
    const [[team]] = await db.execute('SELECT * FROM agent_teams WHERE id=?', [req.params.id]);
    if (!team) return res.status(404).json({ error: 'Not found' });
    const [members] = await db.execute(
      `SELECT atm.id, atm.role, p.id AS persona_id, p.name, p.description, p.figure_type, p.figure,
              p.role AS persona_role, p.capabilities, p.prompt
       FROM agent_team_members atm
       JOIN agent_personas p ON p.id = atm.persona_id
       WHERE atm.team_id = ?
       ORDER BY atm.id ASC`, [req.params.id]
    );
    const [flows] = await db.execute(
      `SELECT f.* FROM agent_flows f
       JOIN agent_team_flows atf ON atf.flow_id = f.id
       WHERE atf.team_id = ?`, [req.params.id]
    );
    res.json({ ok: true, team: { ...team, members, flows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/agents/teams/:id', authRequired, devRequired, async (req, res) => {
  try {
    const { name, description, orchestrator_prompt, pack_source_url, role_assignments, execution_mode, tasks_json, language } = req.body;
    await db.execute(
      'UPDATE agent_teams SET name=?, description=?, orchestrator_prompt=?, pack_source_url=?, role_assignments=?, execution_mode=?, tasks_json=?, language=? WHERE id=?',
      [name, description || '', orchestrator_prompt || '', pack_source_url || null, role_assignments ? JSON.stringify(role_assignments) : null, execution_mode || 'concurrent', JSON.stringify(tasks_json || []), language || 'en', req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/agents/teams/:id', authRequired, devRequired, async (req, res) => {
  try {
    await db.execute('DELETE FROM agent_teams WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Agent Packs ──────────────────────────────────────────────────────────────

app.get('/api/agents/packs', authRequired, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM agent_packs ORDER BY name ASC');
    res.json({ ok: true, packs: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents/packs', authRequired, devRequired, async (req, res) => {
  try {
    const { name, description, room_id, pack_source_url, role_assignments } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const [result] = await db.execute(
      'INSERT INTO agent_packs (name, description, room_id, pack_source_url, role_assignments, created_by_user_id) VALUES (?,?,?,?,?,?)',
      [name.trim(), description || '', Number(room_id) || 50, pack_source_url || '', JSON.stringify(role_assignments || {}), req.user.habbo_user_id]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agents/packs/:id', authRequired, async (req, res) => {
  try {
    const [[row]] = await db.execute('SELECT * FROM agent_packs WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, pack: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/agents/packs/:id', authRequired, devRequired, async (req, res) => {
  try {
    const { name, description, room_id, pack_source_url, role_assignments } = req.body;
    await db.execute(
      'UPDATE agent_packs SET name=?, description=?, room_id=?, pack_source_url=?, role_assignments=? WHERE id=?',
      [name, description || '', Number(room_id) || 50, pack_source_url || '', JSON.stringify(role_assignments || {}), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/agents/packs/:id', authRequired, devRequired, async (req, res) => {
  try {
    await db.execute('DELETE FROM agent_packs WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents/packs/:id/trigger', authRequired, async (req, res) => {
  try {
    const [[pack]] = await db.execute('SELECT * FROM agent_packs WHERE id=?', [req.params.id]);
    if (!pack) return res.status(404).json({ error: 'Pack not found' });

    const roleAssignments = typeof pack.role_assignments === 'string'
      ? JSON.parse(pack.role_assignments)
      : pack.role_assignments;
    if (!roleAssignments || Object.keys(roleAssignments).length === 0) {
      return res.status(400).json({ error: 'Pack has no role assignments. Edit the pack to assign roles.' });
    }

    const r = await fetch(`${AGENT_TRIGGER_URL}/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': PORTAL_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        pack_id: Number(req.params.id),
        pack_source_url: pack.pack_source_url,
        role_assignments: roleAssignments,
        room_id: pack.room_id,
        triggered_by: req.user.habbo_username,
        portal_user_id: (await getPortalUserByHabboUserId(req.user.habbo_user_id))?.id,
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: data.error || 'Trigger failed' });
    res.json({ ok: true, ...data });
  } catch (err) { res.status(502).json({ error: 'Agent trigger unavailable: ' + err.message }); }
});

app.post('/api/agents/teams/:id/members', authRequired, devRequired, async (req, res) => {
  try {
    const { persona_id, role } = req.body;
    await db.execute(
      'INSERT IGNORE INTO agent_team_members (team_id, persona_id, role) VALUES (?,?,?)',
      [req.params.id, persona_id, role || '']
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/agents/teams/:id/members/:memberId', authRequired, devRequired, async (req, res) => {
  try {
    await db.execute('DELETE FROM agent_team_members WHERE id=? AND team_id=?', [req.params.memberId, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents/teams/:id/flows', authRequired, devRequired, async (req, res) => {
  try {
    const { flow_id } = req.body;
    await db.execute('INSERT IGNORE INTO agent_team_flows (team_id, flow_id) VALUES (?,?)', [req.params.id, flow_id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/agents/teams/:id/flows/:flowId', authRequired, devRequired, async (req, res) => {
  try {
    await db.execute('DELETE FROM agent_team_flows WHERE team_id=? AND flow_id=?', [req.params.id, req.params.flowId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Room Templates ────────────────────────────────────────────────────────────

app.get('/api/agents/teams/:id/templates', authRequired, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM agent_room_templates WHERE team_id=? ORDER BY bot_name ASC',
      [req.params.id]
    );
    res.json({ ok: true, templates: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents/teams/:id/templates', authRequired, devRequired, async (req, res) => {
  try {
    const { bot_name, room_id, x, y, rot } = req.body;
    if (!bot_name?.trim()) return res.status(400).json({ error: 'bot_name required' });
    await db.execute(
      `INSERT INTO agent_room_templates (team_id, bot_name, room_id, x, y, rot)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE room_id=VALUES(room_id), x=VALUES(x), y=VALUES(y), rot=VALUES(rot)`,
      [req.params.id, bot_name.trim(), Number(room_id) || 0, Number(x) || 0, Number(y) || 0, Number(rot) || 2]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/agents/teams/:id/templates/:templateId', authRequired, devRequired, async (req, res) => {
  try {
    await db.execute(
      'DELETE FROM agent_room_templates WHERE id=? AND team_id=?',
      [req.params.templateId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Trigger a marketplace team (developer-only — normal users use /api/my/teams/:id/trigger)
app.post('/api/agents/teams/:id/trigger', authRequired, devRequired, async (req, res) => {
  try {
    const { flow_id, room_id } = req.body;
    const [[team]] = await db.execute('SELECT id, name, pack_source_url, role_assignments FROM agent_teams WHERE id=?', [req.params.id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Validate room exists in hotel
    const resolvedRoomId = Number(room_id) || 50;
    const [[room]] = await db.execute('SELECT id, name FROM rooms WHERE id = ? LIMIT 1', [resolvedRoomId]);
    if (!room) return res.status(400).json({ error: `Room ${resolvedRoomId} does not exist in the hotel. Create it first or use a valid room ID.` });

    // Validate all members have a bot linked (skip in pack mode — role_assignments handles bot mapping)
    if (!team.pack_source_url) {
      const [members] = await db.execute(
        `SELECT p.name, p.bot_name FROM agent_team_members atm
         JOIN agent_personas p ON p.id = atm.persona_id
         WHERE atm.team_id = ?`, [req.params.id]
      );
      if (members.length === 0) {
        return res.status(400).json({ error: 'Team has no members. Add at least one persona.' });
      }
      const unlinked = members.filter(m => !m.bot_name?.trim());
      if (unlinked.length > 0) {
        return res.status(400).json({
          error: `Cannot launch: ${unlinked.map(m => `"${m.name}"`).join(', ')} ${unlinked.length === 1 ? 'has' : 'have'} no bot linked. Edit the persona(s) to assign a hotel bot.`
        });
      }

      // Validate bots are not already active in a different room
      const botNames = members.map(m => m.bot_name).filter(Boolean);
      if (botNames.length > 0) {
        const placeholders = botNames.map(() => '?').join(',');
        const [activeBots] = await db.execute(
          `SELECT name, room_id FROM bots WHERE name IN (${placeholders}) AND room_id > 0`,
          botNames
        );
        const wrongRoom = activeBots.filter(b => Number(b.room_id) !== resolvedRoomId);
        if (wrongRoom.length > 0) {
          const conflictRoom = wrongRoom[0].room_id;
          const names = wrongRoom.map(b => `"${b.name}"`).join(', ');
          return res.status(400).json({
            error: `Team can't start in room ${resolvedRoomId} — ${names} ${wrongRoom.length === 1 ? 'is' : 'are'} already active in room ${conflictRoom}. Stop the current session or trigger the correct room.`
          });
        }
      }
    }

    // Always look up portal_user_id from DB — don't rely on JWT (old sessions won't have it)
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);

    const r = await fetch(`${AGENT_TRIGGER_URL}/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': PORTAL_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        team_id: Number(req.params.id),
        flow_id: flow_id ? Number(flow_id) : null,
        room_id: Number(room_id) || 50,
        triggered_by: req.user.username,
        portal_url: process.env.PORTAL_PUBLIC_URL || `http://agent-portal:3000`,
        portal_user_id: portalUser?.id,
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: data.error || 'Trigger failed' });
    res.json({ ok: true, ...data });
  } catch (err) { res.status(502).json({ error: 'Agent trigger unavailable: ' + err.message }); }
});

// Stop active team
app.post('/api/agents/stop', authRequired, async (req, res) => {
  try {
    const r = await fetch(`${AGENT_TRIGGER_URL}/reset`, { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    res.json({ ok: true, ...data });
  } catch (err) { res.status(502).json({ error: 'Agent trigger unavailable' }); }
});

app.get('/api/agents/logs', authRequired, async (req, res) => {
  try {
    const lines = Math.min(parseInt(req.query.lines ?? '150'), 500);
    const r = await fetch(`${AGENT_TRIGGER_URL}/logs?lines=${lines}`);
    const data = await r.json().catch(() => ({ ok: false, lines: [] }));
    res.json(data);
  } catch (err) { res.json({ ok: false, lines: [], error: 'Agent trigger unavailable' }); }
});

// ── Agent Flows ─────────────────────────────────────────────────────────────

app.get('/api/agents/flows', authRequired, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM agent_flows ORDER BY name ASC');
    res.json({ ok: true, flows: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents/flows', authRequired, devRequired, async (req, res) => {
  try {
    const { name, description, tasks_json, allowed_tools_json } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const [result] = await db.execute(
      'INSERT INTO agent_flows (name, description, tasks_json, allowed_tools_json, created_by_user_id) VALUES (?,?,?,?,?)',
      [name.trim(), description || '', JSON.stringify(tasks_json || []), JSON.stringify(allowed_tools_json || []), req.user.habbo_user_id]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agents/flows/:id', authRequired, async (req, res) => {
  try {
    const [[row]] = await db.execute('SELECT * FROM agent_flows WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, flow: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/agents/flows/:id', authRequired, devRequired, async (req, res) => {
  try {
    const { name, description, tasks_json, allowed_tools_json } = req.body;
    await db.execute(
      'UPDATE agent_flows SET name=?, description=?, tasks_json=?, allowed_tools_json=? WHERE id=?',
      [name, description || '', JSON.stringify(tasks_json || []), JSON.stringify(allowed_tools_json || []), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/agents/flows/:id', authRequired, devRequired, async (req, res) => {
  try {
    await db.execute('DELETE FROM agent_flows WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all deployed bots (for persona bot picker)
app.get('/api/agents/bots', authRequired, async (req, res) => {
  try {
    if (req.query.mine === 'true') {
      const [rows] = await db.execute(
        'SELECT id, name, room_id, x, y, figure FROM bots WHERE user_id = ? ORDER BY name ASC',
        [req.user.habbo_user_id]
      );
      return res.json({ ok: true, bots: rows });
    }
    const [rows] = await db.execute(
      'SELECT id, name, room_id, x, y, figure FROM bots ORDER BY name ASC'
    );
    res.json({ ok: true, bots: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── User-scoped endpoints (/api/my/*) ─────────────────────────────────────────

// My Personas CRUD
app.get('/api/my/personas', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [rows] = await db.execute(
      'SELECT * FROM user_personas WHERE portal_user_id = ? ORDER BY name ASC',
      [portalUser.id]
    );
    res.json({ ok: true, personas: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/my/personas', authRequired, tierGate('pro'), async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const { name, description, prompt, role, capabilities, figure_type, figure, bot_name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const [result] = await db.execute(
      `INSERT INTO user_personas (portal_user_id, name, description, prompt, role, capabilities, figure_type, figure, bot_name)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [portalUser.id, name.trim(), description || '', prompt || '', role || '', capabilities || '', figure_type || 'agent-m', figure || '', bot_name || '']
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already have a persona with that name' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/my/personas/:id', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [[existing]] = await db.execute('SELECT id FROM user_personas WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, description, prompt, role, capabilities, figure_type, figure, bot_name } = req.body;
    await db.execute(
      `UPDATE user_personas SET name=?, description=?, prompt=?, role=?, capabilities=?, figure_type=?, figure=?, bot_name=? WHERE id=? AND portal_user_id=?`,
      [name, description || '', prompt || '', role || '', capabilities || '', figure_type || 'agent-m', figure || '', bot_name || '', req.params.id, portalUser.id]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already have a persona with that name' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/my/personas/:id', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    await db.execute('DELETE FROM user_personas WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// My Teams CRUD
app.get('/api/my/teams', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [teams] = await db.execute(
      'SELECT * FROM user_teams WHERE portal_user_id = ? ORDER BY name ASC',
      [portalUser.id]
    );
    for (const team of teams) {
      const [members] = await db.execute(
        `SELECT utm.id, utm.role, up.id AS persona_id, up.name, up.description, up.figure_type, up.figure, up.bot_name
         FROM user_team_members utm
         JOIN user_personas up ON up.id = utm.user_persona_id
         WHERE utm.user_team_id = ?`, [team.id]
      );
      team.members = members;
    }
    res.json({ ok: true, teams });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Single user team (same shape as GET /api/agents/teams/:id for the dashboard)
app.get('/api/my/teams/:id', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [[team]] = await db.execute(
      'SELECT * FROM user_teams WHERE id = ? AND portal_user_id = ?',
      [req.params.id, portalUser.id]
    );
    if (!team) return res.status(404).json({ error: 'Not found' });
    const [members] = await db.execute(
      `SELECT utm.id, utm.role, up.id AS persona_id, up.name, up.description, up.figure_type, up.figure, up.bot_name
       FROM user_team_members utm
       JOIN user_personas up ON up.id = utm.user_persona_id
       WHERE utm.user_team_id = ?
       ORDER BY utm.id ASC`,
      [team.id]
    );
    res.json({ ok: true, team: { ...team, members, flows: [] } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/my/teams', authRequired, tierGate('pro'), async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const { name, description, orchestrator_prompt, execution_mode, tasks_json, language, default_room_id } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const [result] = await db.execute(
      `INSERT INTO user_teams (portal_user_id, name, description, orchestrator_prompt, execution_mode, tasks_json, language, default_room_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [portalUser.id, name.trim(), description || '', orchestrator_prompt || '', execution_mode || 'concurrent', JSON.stringify(tasks_json || []), language || 'en', Number(default_room_id) || 50]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already have a team with that name' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/my/teams/:id', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [[existing]] = await db.execute('SELECT id FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { name, description, orchestrator_prompt, execution_mode, tasks_json, language, default_room_id } = req.body;
    await db.execute(
      `UPDATE user_teams SET name=?, description=?, orchestrator_prompt=?, execution_mode=?, tasks_json=?, language=?, default_room_id=? WHERE id=? AND portal_user_id=?`,
      [name, description || '', orchestrator_prompt || '', execution_mode || 'concurrent', JSON.stringify(tasks_json || []), language || 'en', Number(default_room_id) || 50, req.params.id, portalUser.id]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already have a team with that name' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/my/teams/:id', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    await db.execute('DELETE FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/my/teams/:id/members', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [[team]] = await db.execute('SELECT id FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const { persona_id, role } = req.body;
    // Verify persona belongs to this user
    const [[persona]] = await db.execute('SELECT id FROM user_personas WHERE id = ? AND portal_user_id = ?', [persona_id, portalUser.id]);
    if (!persona) return res.status(400).json({ error: 'Persona not found or not yours' });
    await db.execute(
      'INSERT IGNORE INTO user_team_members (user_team_id, user_persona_id, role) VALUES (?,?,?)',
      [req.params.id, persona_id, role || '']
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/my/teams/:id/members/:memberId', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [[team]] = await db.execute('SELECT id FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    await db.execute('DELETE FROM user_team_members WHERE id = ? AND user_team_id = ?', [req.params.memberId, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Trigger my team
app.post('/api/my/teams/:id/trigger', authRequired, tierGate('pro'), async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [[team]] = await db.execute('SELECT * FROM user_teams WHERE id = ? AND portal_user_id = ?', [req.params.id, portalUser.id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const { room_id } = req.body;
    const resolvedRoomId = Number(room_id) || team.default_room_id || 50;

    // Validate room exists
    const [[room]] = await db.execute('SELECT id, name FROM rooms WHERE id = ? LIMIT 1', [resolvedRoomId]);
    if (!room) return res.status(400).json({ error: `Room ${resolvedRoomId} does not exist in the hotel.` });

    // Get members with their personas
    const [members] = await db.execute(
      `SELECT up.name, up.role AS persona_role, up.capabilities, up.prompt, up.figure_type, up.bot_name, utm.role AS team_role
       FROM user_team_members utm JOIN user_personas up ON up.id = utm.user_persona_id
       WHERE utm.user_team_id = ?`, [team.id]
    );

    if (members.length === 0) return res.status(400).json({ error: 'Team has no members. Add at least one persona.' });

    const unlinked = members.filter(m => !m.bot_name?.trim());
    if (unlinked.length > 0) {
      return res.status(400).json({
        error: `Cannot launch: ${unlinked.map(m => `"${m.name}"`).join(', ')} ${unlinked.length === 1 ? 'has' : 'have'} no bot linked.`
      });
    }

    // Check bot conflicts
    const botNames = members.map(m => m.bot_name).filter(Boolean);
    if (botNames.length > 0) {
      const placeholders = botNames.map(() => '?').join(',');
      const [activeBots] = await db.execute(
        `SELECT name, room_id FROM bots WHERE name IN (${placeholders}) AND room_id > 0`,
        botNames
      );
      const wrongRoom = activeBots.filter(b => Number(b.room_id) !== resolvedRoomId);
      if (wrongRoom.length > 0) {
        return res.status(400).json({
          error: `Bot ${wrongRoom.map(b => `"${b.name}"`).join(', ')} already active in room ${wrongRoom[0].room_id}.`
        });
      }
    }

    // Forward to agent-trigger — build a compatible config
    const r = await fetch(`${AGENT_TRIGGER_URL}/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': PORTAL_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        team_id: team.id,
        user_team: true,
        room_id: resolvedRoomId,
        triggered_by: req.user.username,
        portal_url: process.env.PORTAL_PUBLIC_URL || `http://agent-portal:3000`,
        portal_user_id: portalUser.id,
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: data.error || 'Trigger failed' });
    res.json({ ok: true, ...data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Marketplace install ───────────────────────────────────────────────────────

app.post('/api/marketplace/teams/:id/install', authRequired, tierGate('pro'), async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const marketplaceTeamId = Number(req.params.id);

    // Check not already installed
    const [[alreadyInstalled]] = await db.execute(
      'SELECT id FROM user_teams WHERE portal_user_id = ? AND source_team_id = ?',
      [portalUser.id, marketplaceTeamId]
    );
    if (alreadyInstalled) return res.status(409).json({ error: 'Team already installed', user_team_id: alreadyInstalled.id });

    // Fetch marketplace team + members
    const [[mTeam]] = await db.execute('SELECT * FROM agent_teams WHERE id = ?', [marketplaceTeamId]);
    if (!mTeam) return res.status(404).json({ error: 'Marketplace team not found' });
    const [mMembers] = await db.execute(
      `SELECT p.*, atm.role AS team_role
       FROM agent_team_members atm JOIN agent_personas p ON p.id = atm.persona_id
       WHERE atm.team_id = ?`, [marketplaceTeamId]
    );

    // Fork personas
    const personaIdMap = {}; // marketplace persona id → new user persona id
    for (const mp of mMembers) {
      // Check if user already has a persona with same name (from a previous install)
      let suffix = '';
      let attempts = 0;
      while (attempts < 5) {
        const candidateName = `${mp.name}${suffix}`;
        const [[dup]] = await db.execute(
          'SELECT id FROM user_personas WHERE portal_user_id = ? AND name = ?',
          [portalUser.id, candidateName]
        );
        if (!dup) {
          const [result] = await db.execute(
            `INSERT INTO user_personas (portal_user_id, source_persona_id, name, description, prompt, role, capabilities, figure_type, figure, bot_name)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [portalUser.id, mp.id, candidateName, mp.description || '', mp.prompt || '', mp.role || '', mp.capabilities || '', mp.figure_type || 'agent-m', mp.figure || '', '']
          );
          personaIdMap[mp.id] = result.insertId;
          break;
        }
        attempts++;
        suffix = ` (${attempts + 1})`;
      }
    }

    // Fork team
    const [teamResult] = await db.execute(
      `INSERT INTO user_teams (portal_user_id, source_team_id, name, description, orchestrator_prompt, execution_mode, tasks_json, language, default_room_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [portalUser.id, marketplaceTeamId, mTeam.name, mTeam.description || '', mTeam.orchestrator_prompt || '', mTeam.execution_mode || 'concurrent', mTeam.tasks_json || '[]', mTeam.language || 'en', 50]
    );
    const userTeamId = teamResult.insertId;

    // Link forked personas to forked team
    for (const mp of mMembers) {
      const userPersonaId = personaIdMap[mp.id];
      if (userPersonaId) {
        await db.execute(
          'INSERT INTO user_team_members (user_team_id, user_persona_id, role) VALUES (?,?,?)',
          [userTeamId, userPersonaId, mp.team_role || '']
        );
      }
    }

    res.json({ ok: true, user_team_id: userTeamId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Team already installed or name conflict' });
    res.status(500).json({ error: err.message });
  }
});

// ── User team config for agent-trigger ────────────────────────────────────────

app.get('/api/internal/user-teams/:id/config', async (req, res) => {
  try {
    const secret = req.headers['x-internal-secret'];
    if (PORTAL_INTERNAL_SECRET && secret !== PORTAL_INTERNAL_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const userTeamId = Number(req.params.id);
    const [[team]] = await db.execute('SELECT * FROM user_teams WHERE id=?', [userTeamId]);
    if (!team) return res.status(404).json({ error: 'User team not found' });
    const [members] = await db.execute(
      `SELECT up.name, up.role AS persona_role, up.capabilities, up.prompt, up.figure_type, up.bot_name, utm.role AS team_role
       FROM user_team_members utm JOIN user_personas up ON up.id = utm.user_persona_id
       WHERE utm.user_team_id = ?`, [userTeamId]
    );
    res.json({ ok: true, team, members, flow: null, templates: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List user's installed team source IDs (for marketplace "installed" badges)
app.get('/api/my/installed-team-ids', authRequired, async (req, res) => {
  try {
    const portalUser = await getPortalUserByHabboUserId(req.user.habbo_user_id);
    if (!portalUser) return res.status(404).json({ error: 'Portal user not found' });
    const [rows] = await db.execute(
      'SELECT source_team_id FROM user_teams WHERE portal_user_id = ? AND source_team_id IS NOT NULL',
      [portalUser.id]
    );
    res.json({ ok: true, installed: rows.map(r => r.source_team_id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Agent Status ─────────────────────────────────────────────────────────────

app.get('/api/agents/status', authRequired, async (req, res) => {
  try {
    const MCP_URL = (process.env.HOTEL_MCP_URL || 'http://habbo-mcp:3003/mcp').replace(/\/?$/, '');
    const MCP_KEY = process.env.MCP_API_KEY || '';

    const [triggerRes, mcpRes, globalPersonasRes, userPersonasRes, roomsRes] = await Promise.allSettled([
      fetch(`${AGENT_TRIGGER_URL}/health`).then(r => r.json()),
      fetch(`${AGENT_TRIGGER_URL}/mcp-status`).then(r => r.json()),
      // Global marketplace personas (developer-created templates, bot_name now cleared)
      db.execute(`
        SELECT p.name AS persona_name, p.bot_name, p.figure AS persona_figure,
               at2.name AS team_name
        FROM agent_personas p
        LEFT JOIN agent_team_members atm ON atm.persona_id = p.id
        LEFT JOIN agent_teams at2 ON at2.id = atm.team_id
        WHERE p.bot_name != ''
      `),
      // User-scoped personas — these are the bots actually deployed by users
      db.execute(`
        SELECT up.name AS persona_name, up.bot_name, up.figure AS persona_figure,
               ut.name AS team_name
        FROM user_personas up
        LEFT JOIN user_team_members utm ON utm.user_persona_id = up.id
        LEFT JOIN user_teams ut ON ut.id = utm.user_team_id
        WHERE up.bot_name != ''
      `),
      db.execute('SELECT id, caption AS name FROM rooms'),
    ]);

    // Build room name lookup
    const roomNames = {};
    if (roomsRes.status === 'fulfilled') {
      for (const r of roomsRes.value[0]) roomNames[r.id] = r.name;
    }

    // Call MCP list_bots for truly live game state
    let liveBots = [];
    try {
      const headers = { 'content-type': 'application/json' };
      if (MCP_KEY) headers['authorization'] = `Bearer ${MCP_KEY}`;
      const mcpBotRes = await fetch(MCP_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 'status', method: 'tools/call', params: { name: 'list_bots', arguments: {} } }),
        signal: AbortSignal.timeout(4000),
      });
      const mcpData = await mcpBotRes.json();
      const parsed = JSON.parse(mcpData.result?.content?.[0]?.text || '{}');
      const allBots = parsed.bots || [];

      // Build a unified persona map: user personas take precedence over global ones
      const personaMap = {};
      const globalPersonas = globalPersonasRes.status === 'fulfilled' ? globalPersonasRes.value[0] : [];
      const userPersonas = userPersonasRes.status === 'fulfilled' ? userPersonasRes.value[0] : [];
      for (const p of globalPersonas) {
        if (p.bot_name) personaMap[p.bot_name.toLowerCase()] = p;
      }
      for (const p of userPersonas) {
        if (p.bot_name) personaMap[p.bot_name.toLowerCase()] = p; // user entries win
      }

      const enriched = allBots
        .filter(b => b.room_id > 0)
        .map(b => ({
          ...b,
          room_name: roomNames[b.room_id] || null,
          ...(personaMap[b.name?.toLowerCase()] || {}),
          is_agent: !!personaMap[b.name?.toLowerCase()],
        }));

      // Deduplicate by name+room: prefer the entry with an actual position (x>0 or y>0)
      const seen = new Map();
      for (const b of enriched) {
        const key = `${b.name?.toLowerCase()}:${b.room_id}`;
        const existing = seen.get(key);
        if (!existing || (b.x > 0 || b.y > 0)) seen.set(key, b);
      }

      liveBots = [...seen.values()]
        .sort((a, b) => (b.is_agent ? 1 : 0) - (a.is_agent ? 1 : 0) || a.name.localeCompare(b.name));
    } catch (e) { /* MCP unreachable — return empty */ }

    res.json({
      ok: true,
      trigger: triggerRes.status === 'fulfilled' ? triggerRes.value : { ok: false },
      bots: liveBots,
      mcp: mcpRes.status === 'fulfilled' ? mcpRes.value : { ok: false, servers: [], error: 'agent-trigger unreachable' },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Internal endpoint for agent-trigger ────────────────────────────────────

app.get('/api/internal/teams/:id/config', async (req, res) => {
  try {
    const secret = req.headers['x-internal-secret'];
    if (PORTAL_INTERNAL_SECRET && secret !== PORTAL_INTERNAL_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const teamId = Number(req.params.id);
    const flowId = req.query.flow_id ? Number(req.query.flow_id) : null;
    const [[team]] = await db.execute('SELECT * FROM agent_teams WHERE id=?', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const [members] = await db.execute(
      `SELECT p.name, p.role AS persona_role, p.capabilities, p.prompt, p.figure_type, p.bot_name, atm.role AS team_role
       FROM agent_team_members atm JOIN agent_personas p ON p.id = atm.persona_id
       WHERE atm.team_id = ?`, [teamId]
    );
    const flow = flowId
      ? (await db.execute('SELECT * FROM agent_flows WHERE id=?', [flowId]))[0][0]
      : null;
    const [templates] = await db.execute(
      'SELECT bot_name, room_id, x, y, rot FROM agent_room_templates WHERE team_id=?',
      [teamId]
    );
    res.json({ ok: true, team, members, flow, templates });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const indexPath = path.join(__dirname, 'dist/index.html');

app.get('/', (req, res) => {
  const sessionUser = getSessionUser(req);
  const suffix = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return res.redirect(`${sessionUser ? '/app' : '/login'}${suffix}`);
});

app.get('/login', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (sessionUser) {
    return res.redirect('/app');
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(indexPath);
});

app.get('/app', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return res.redirect('/login');
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(indexPath);
});

app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
    // Hashed assets must not stick in browser when we redeploy (otherwise "nothing changes")
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.map')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  },
}));
app.get('*', (_req, res) => {
  res.redirect('/login');
});

ensurePortalSchema()
  .then(ensureBootstrapPortalUser)
  .then(ensureAgentSeedData)
  .then(async () => {
    if (mailTransport) {
      try {
        await mailTransport.verify();
        console.log(`portal SMTP ready on ${PORTAL_SMTP_HOST}:${PORTAL_SMTP_PORT}`);
      } catch (err) {
        console.warn(`portal SMTP verify failed (${err.message}); email features may not work but portal will start`);
      }
    } else {
      console.warn('portal SMTP is disabled (PORTAL_SMTP_HOST not set); password reset emails will not be sent');
    }
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`agent-hotel-portal listening on :${PORT}`);
      try {
        console.log(`portal dist JS (from dist/index.html): ${distMainJsFingerprint()}`);
      } catch { /* ignore */ }
    });
  })
  .catch((err) => {
    console.error('Failed to start portal:', err);
    process.exit(1);
  });
