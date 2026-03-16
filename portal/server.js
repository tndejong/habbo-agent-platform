import path from 'node:path';
import net from 'node:net';
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const PORTAL_SMTP_HOST = (process.env.PORTAL_SMTP_HOST || '').trim();
const PORTAL_SMTP_PORT = Number.parseInt(process.env.PORTAL_SMTP_PORT || '1025', 10);
const PORTAL_SMTP_SECURE = process.env.PORTAL_SMTP_SECURE === 'true';
const PORTAL_SMTP_USER = (process.env.PORTAL_SMTP_USER || '').trim();
const PORTAL_SMTP_PASS = process.env.PORTAL_SMTP_PASS || '';
const PORTAL_SMTP_FROM = (process.env.PORTAL_SMTP_FROM || 'Agent Hotel <no-reply@hotel.local>').trim();
const PORTAL_MCP_TOKEN_TTL_DAYS = Number.parseInt(process.env.PORTAL_MCP_TOKEN_TTL_DAYS || '365', 10);
const PORTAL_MCP_DEFAULT_TENANT = (process.env.PORTAL_MCP_DEFAULT_TENANT || 'default').trim();

const db = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  port: Number.parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'arcturus_user',
  password: process.env.DB_PASSWORD || 'arcturus_pw',
  database: process.env.DB_NAME || 'arcturus',
  connectionLimit: 8,
  waitForConnections: true
});

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
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
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
    'SELECT id, email, username, habbo_user_id, habbo_username, ai_tier FROM portal_users WHERE habbo_user_id = ? LIMIT 1',
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
    console.log('portal bootstrap user already exists; skipping');
    return;
  }

  const passwordHash = await bcrypt.hash(PORTAL_BOOTSTRAP_PASSWORD, 12);
  await db.execute(
    'INSERT INTO portal_users (email, username, password_hash, habbo_user_id, habbo_username) VALUES (?, ?, ?, ?, ?)',
    [PORTAL_BOOTSTRAP_EMAIL, PORTAL_BOOTSTRAP_USERNAME, passwordHash, habboUser.id, habboUser.username]
  );
  console.log(`portal bootstrap user created for Habbo '${habboUser.username}'`);
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
app.use(express.json());
app.use(cookieParser());

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

app.post('/api/auth/register', async (req, res) => {
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

    await db.execute(
      'INSERT INTO portal_users (email, username, password_hash, habbo_user_id, habbo_username) VALUES (?, ?, ?, ?, ?)',
      [email, username, passwordHash, habboUser.id, habboUser.username]
    );

    issueAuthCookie(res, {
      email,
      username,
      habbo_user_id: habboUser.id,
      habbo_username: habboUser.username
    });

    return res.json({
      ok: true,
      user: { email, username, habbo_username: habboUser.username, ai_tier: 'basic' }
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
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
    habbo_username: user.habbo_username
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

app.post('/api/auth/forgot-password', async (req, res) => {
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

app.post('/api/auth/reset-password', async (req, res) => {
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

  res.json({
    ok: true,
    user: {
      email: req.user.email,
      username: req.user.username,
      habbo_username: req.user.habbo_username,
      ai_tier: portalUser?.ai_tier || 'basic'
    }
  });
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
  return res.sendFile(indexPath);
});

app.get('/app', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return res.redirect('/login');
  }
  return res.sendFile(indexPath);
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.redirect('/login');
});

ensurePortalSchema()
  .then(ensureBootstrapPortalUser)
  .then(async () => {
    if (mailTransport) {
      await mailTransport.verify();
      console.log(`portal SMTP ready on ${PORTAL_SMTP_HOST}:${PORTAL_SMTP_PORT}`);
    } else {
      console.warn('portal SMTP is disabled (PORTAL_SMTP_HOST not set); password reset emails will not be sent');
    }
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`agent-hotel-portal listening on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start portal:', err);
    process.exit(1);
  });
