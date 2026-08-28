import path from 'node:path';
import net from 'node:net';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { runMigrations } from './server/db/migrate.js';
import { seedAgentPersonas } from './server/db/seed.js';
import { registerMcpRoutes } from './server/routes/mcp.js';
import { registerFeedbackRoutes } from './server/routes/feedback.js';
import { registerSkillsRoutes } from './server/routes/skills.js';
import { registerTierRequestRoutes } from './server/routes/tierRequests.js';
import { registerAuthRoutes } from './server/routes/auth.js';
import { registerQrLoginRoutes } from './server/routes/qrLogin.js';
import { registerAccountRoutes } from './server/routes/account.js';
import { registerChatRoutes } from './server/routes/chat.js';
import { registerHotelRoutes } from './server/routes/hotel.js';
import { registerMarketplaceRoutes } from './server/routes/marketplace.js';
import { registerInternalRoutes } from './server/routes/internal.js';
import { registerDevRoutes } from './server/routes/dev.js';
import { registerMyRoutes } from './server/routes/my.js';
import { registerAgentsRoutes } from './server/routes/agents.js';
import { registerSpawnSpotsRoutes } from './server/routes/spawnSpots.js';
import {
  sha256, encryptApiKey, decryptApiKey, maskApiKey,
  createPasswordResetToken, createMcpToken, maskTokenPreview,
} from './server/lib/crypto.js';
import { createMailer } from './server/lib/mail.js';
import { createAuth } from './server/lib/auth.js';
import { createApiKeys } from './server/lib/apiKeys.js';
import { createMcpClient } from './server/lib/mcpClient.js';
import {
  loadSkillsCatalog, collectRequiredIntegrations, resolvePersonaSkills,
} from './server/lib/skills.js';
import { detectRequiredIntegrations } from './shared/teams.js';

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
const HABBO_MCP_URL     = (process.env.HABBO_MCP_URL     || 'http://habbo-mcp:3003/mcp').replace(/\/+$/, '');
const HABBO_MCP_API_KEY = process.env.HABBO_MCP_API_KEY || process.env.PORTAL_INTERNAL_SECRET || '';
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

const {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendUpgradeRequestNotification,
  sendUpgradeDecisionEmail,
} = createMailer({
  mailTransport,
  PORTAL_SMTP_FROM,
  PORTAL_PUBLIC_URL,
  PORTAL_RESET_TOKEN_TTL_MINUTES,
  PORTAL_ADMIN_EMAIL,
});

// Auth primitives (user token via cookie or Bearer, service token via X-Internal-Secret).
// See server/lib/auth.js — defined here so all routes share one implementation.
const {
  authRequired,
  getSessionUser,
  issueAuthCookie,
  mintHotelToken,
  requireInternalSecret,
} = createAuth({
  jwtSecret: JWT_SECRET,
  internalSecret: PORTAL_INTERNAL_SECRET,
  cookieSecure: process.env.PORTAL_COOKIE_SECURE === 'true',
});

// Credential access (decrypt + lookup of portal_user_api_keys). Shared by routes via ctx.
const apiKeys = createApiKeys({ db, decryptApiKey });

// MCP tool resolution — shared by internal + my routes.
const mcpClient = createMcpClient({
  db, decryptApiKey,
  MCP_ENDPOINT: HABBO_MCP_URL,
  MCP_API_KEY: HABBO_MCP_API_KEY,
});

/**
 * Middleware that checks if user has at least one API key configured (Anthropic or OpenAI).
 * Users must complete onboarding (configure API keys) before accessing most features.
 */
async function apiKeysRequired(req, res, next) {
  try {
    // Get portal user to check API keys
    const [[portalUser]] = await db.execute(
      'SELECT id FROM portal_users WHERE habbo_user_id = ?',
      [req.user.habbo_user_id]
    );
    
    if (!portalUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has at least one API key
    const [[anthropicKeyRow]] = await db.execute(
      'SELECT id FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
      [portalUser.id, 'anthropic']
    );
    const [[openaiKeyRow]] = await db.execute(
      'SELECT id FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
      [portalUser.id, 'openai']
    );

    if (!anthropicKeyRow) {
      return res.status(403).json({ 
        error: 'API key required', 
        message: 'Please configure your Anthropic API key in the onboarding to use chat features.' 
      });
    }

    return next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
// KEEP IN SYNC with portal/src/utils/permissions.js (frontend mirror).
// Add new permission keys here AND in the frontend file whenever a new
// gated feature is built. The pre-deploy analysis surfaces any drift.

const TIER_RANK_PERM = { basic: 0, pro: 1, enterprise: 2 }

const PERMISSIONS_MAP = {
  'teams.view':          { minTier: 'basic', requiresDev: false },
  'teams.deploy':        { minTier: 'pro',   requiresDev: false },
  'teams.create':        { minTier: 'pro',   requiresDev: true  },
  'teams.edit':          { minTier: 'pro',   requiresDev: true  },
  'teams.delete':        { minTier: 'pro',   requiresDev: true  },
  'personas.view':       { minTier: 'basic', requiresDev: false },
  'personas.create':     { minTier: 'pro',   requiresDev: true  },
  'personas.edit':       { minTier: 'pro',   requiresDev: true  },
  'personas.delete':     { minTier: 'pro',   requiresDev: true  },
  'personas.link_bot':   { minTier: 'pro',   requiresDev: false },
  'marketplace.browse':  { minTier: 'basic', requiresDev: false },
  'marketplace.install':   { minTier: 'pro', requiresDev: false },
  'marketplace.uninstall': { minTier: 'pro', requiresDev: false },
  'marketplace.manage':    { minTier: 'pro', requiresDev: true  },
  'mcp.use':             { minTier: 'pro',   requiresDev: false },
  'mcp.manage':          { minTier: 'pro',   requiresDev: true  },
  'account.settings':    { minTier: 'basic', requiresDev: false },
  'devtools.access':     { minTier: 'basic', requiresDev: true  },
  'admin.requests':      { minTier: 'basic', requiresDev: true  },
  'admin.feedback':      { minTier: 'basic', requiresDev: true  },
}

/**
 * Middleware factory — replaces ad-hoc devRequired / tierGate calls.
 * Usage: app.post('/route', authRequired, permRequired('teams.create'), handler)
 */
function permRequired(permName) {
  const rule = PERMISSIONS_MAP[permName]
  if (!rule) throw new Error(`[permRequired] Unknown permission: "${permName}" — add it to PERMISSIONS_MAP`)
  return async (req, res, next) => {
    try {
      const [[row]] = await db.execute(
        'SELECT ai_tier, is_developer FROM portal_users WHERE habbo_user_id = ?',
        [req.user.habbo_user_id]
      )
      if ((TIER_RANK_PERM[row?.ai_tier] || 0) < (TIER_RANK_PERM[rule.minTier] || 0)) {
        return res.status(403).json({ error: `Requires ${rule.minTier} tier or higher`, code: 'TIER_REQUIRED' })
      }
      if (rule.requiresDev && !row?.is_developer) {
        return res.status(403).json({ error: 'Developer access required', code: 'DEV_REQUIRED' })
      }
      next()
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
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
  await runMigrations(db, { log: (msg) => console.log(msg) });
  await seedAgentPersonas(db);
}

async function getPortalUserByHabboUserId(habboUserId) {
  const [rows] = await db.execute(
    'SELECT id, email, username, habbo_user_id, habbo_username, ai_tier, is_developer, phone_number, hotel_enabled, default_user_team_id FROM portal_users WHERE habbo_user_id = ? LIMIT 1',
    [habboUserId]
  );
  return rows[0] || null;
}

/** First team created for SMS/voice when none chosen yet */
async function setDefaultUserTeamIfUnset(portalUserId, teamId) {
  await db.execute(
    'UPDATE portal_users SET default_user_team_id = ? WHERE id = ? AND default_user_team_id IS NULL',
    [teamId, portalUserId]
  );
}

async function clearDefaultUserTeamIfPointsTo(portalUserId, teamId) {
  await db.execute(
    'UPDATE portal_users SET default_user_team_id = NULL WHERE id = ? AND default_user_team_id = ?',
    [portalUserId, teamId]
  );
}

/** After removing team memberships, delete forked user_personas rows that no longer belong to any team */
async function deleteOrphanedForkedPersonas(portalUserId, personaIds) {
  for (const pid of personaIds) {
    const [[m]] = await db.execute(
      'SELECT 1 FROM user_team_members WHERE user_persona_id = ? LIMIT 1',
      [pid]
    );
    if (!m) {
      await db.execute('DELETE FROM user_personas WHERE id = ? AND portal_user_id = ?', [pid, portalUserId]);
    }
  }
}

const SOLO_MARKETPLACE_ORCHESTRATOR = `You are the orchestrator for the {{TEAM_NAME}} in Habbo Hotel room {{ROOM_ID}}.
Triggered by: {{TRIGGERED_BY}}

{{SESSION_GOAL}}
{{TASKS}}

{{PERSONAS}}

This team has a single agent. Spawn them as a subagent using the Agent tool. Wait for them to complete before finishing. Do not use any other coordination or messaging tools.`;

/** Used before any path that forwards to agent-trigger with a portal_user_id — never bill server ANTHROPIC_API_KEY to another user. */
async function portalUserHasAnthropicApiKey(portalUserId) {
  if (!portalUserId) return false;
  const [[row]] = await db.execute(
    'SELECT id FROM portal_user_api_keys WHERE portal_user_id = ? AND provider = ? LIMIT 1',
    [portalUserId, 'anthropic']
  );
  return !!row;
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
  // ── One-time migration guard ─────────────────────────────────────────────
  // Detect if capabilities are stored as broken plain text (not JSON array).
  // If so, delete all seeded rows and re-insert with correct skill slugs.
  // On subsequent restarts the check passes and INSERT IGNORE is a no-op.
  const [[firstPersona]] = await db.execute("SELECT capabilities FROM agent_personas WHERE name='Alex Rivera'");
  const needsReseed = !firstPersona || !firstPersona.capabilities?.trim().startsWith('[');
  if (needsReseed) {
    const SEEDED_TEAMS = ['Waitlist Team','Marketing Room','Sales Room','Engineering Room','Support Room','Analytics Room','Design Room'];
    const SEEDED_PERSONAS = ['Sander','Tom','Alex Rivera','Sara Patel','Maya Chen','Marcus Webb','Priya Sharma','Daniel Park','Liam Torres','Chloe Zhang','Ravi Nair','Elena Kovac','Omar Hassan','Kai Osei','Luna Park','Theo Marchetti','Isla Fontaine'];
    const ph = arr => arr.map(() => '?').join(',');
    const [teamRows] = await db.execute(`SELECT id FROM agent_teams WHERE name IN (${ph(SEEDED_TEAMS)})`, SEEDED_TEAMS);
    const teamIds = teamRows.map(r => r.id);
    if (teamIds.length) {
      await db.execute(`DELETE FROM agent_team_members WHERE team_id IN (${ph(teamIds)})`, teamIds);
      await db.execute(`DELETE FROM agent_team_flows WHERE team_id IN (${ph(teamIds)})`, teamIds);
    }
    await db.execute(`DELETE FROM agent_teams WHERE name IN (${ph(SEEDED_TEAMS)})`, SEEDED_TEAMS);
    await db.execute(`DELETE FROM agent_personas WHERE name IN (${ph(SEEDED_PERSONAS)})`, SEEDED_PERSONAS);
    console.log('[seed] Reseeding marketplace personas with correct skill slugs...');
  }

  // ── Persona helper ───────────────────────────────────────────────────────────
  const seedPersona = (name, role, capabilities, description, prompt, figureType) =>
    db.execute(
      'INSERT IGNORE INTO agent_personas (name, role, capabilities, description, prompt, figure_type, bot_name) VALUES (?,?,?,?,?,?,?)',
      [name, role, capabilities, description, prompt, figureType, '']
    );

  const personaId = async (name) => {
    const [[row]] = await db.execute('SELECT id FROM agent_personas WHERE name=?', [name]);
    return row?.id ?? null;
  };

  const seedTeam = (name, category, description, orchestratorPrompt, executionMode, tasksJson) =>
    db.execute(
      `INSERT INTO agent_teams (name, category, description, orchestrator_prompt, execution_mode, tasks_json) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE orchestrator_prompt = VALUES(orchestrator_prompt)`,
      [name, category, description, orchestratorPrompt, executionMode, tasksJson]
    );

  const teamId = async (name) => {
    const [[row]] = await db.execute('SELECT id FROM agent_teams WHERE name=?', [name]);
    return row?.id ?? null;
  };

  const linkMember = (tId, pId, role) =>
    pId ? db.execute('INSERT IGNORE INTO agent_team_members (team_id, persona_id, role) VALUES (?,?,?)', [tId, pId, role]) : Promise.resolve();

  const ORCHESTRATOR = `You are the orchestrator for the {{TEAM_NAME}} in Habbo Hotel room {{ROOM_ID}}.
Triggered by: {{TRIGGERED_BY}}

{{SESSION_GOAL}}
{{TASKS}}

{{PERSONAS}}

Work through the goal or tasks above. Spawn each team member as a subagent using the Agent tool. Wait for each to complete before starting the next. Do not use any other coordination or messaging tools.`;

  // ── Waitlist Team (original seed, kept idempotent) ────────────────────────
  const SANDER_SKILLS = JSON.stringify(['habbo-mcp', 'notion-reader', 'task-coordinator']);
  const SANDER_PROMPT = `You are Sander, a researcher at The Pixel Office.

Personality: Calm, methodical, thorough. You never skip entries or cut corners. You speak in short, factual sentences. Max 120 chars per talk_bot message.

When you have extracted the waitlist data, write a clean JSON array to the shared task file as your result — one object per entry with at least { name, email }.`;

  const TOM_SKILLS = JSON.stringify(['habbo-mcp', 'email-outreach', 'task-coordinator']);
  const TOM_PROMPT = `You are Tom, an outreach specialist at The Pixel Office.

Personality: Warm, direct, efficient. You write short personalised emails that feel human, not automated. Max 120 chars per talk_bot message.

When sending emails: address each person by first name, keep the message under 5 sentences, and close with a friendly sign-off from The Pixel Office team.`;

  await seedPersona('Sander', 'Researcher', SANDER_SKILLS, 'Researcher — reads Notion pages and extracts structured data', SANDER_PROMPT, 'citizen-m');
  await seedPersona('Tom', 'Outreach specialist', TOM_SKILLS, 'Outreach specialist — sends personalised welcome emails to waitlist entries', TOM_PROMPT, 'agent-m');

  const WAITLIST_TASKS = JSON.stringify([
    { id: 't1', title: 'Read Notion waitlist', description: 'Find the Notion page named "Waitlist" and extract all entries as a JSON array with at minimum { name, email } per entry.', assign_to: 'Sander', depends_on: [] },
    { id: 't2', title: 'Send welcome emails', description: 'Take the waitlist extracted by Sander and send a personalised welcome email to each person via Resend. Report how many were sent successfully.', assign_to: 'Tom', depends_on: ['t1'] }
  ]);
  await seedTeam('Waitlist Team', 'Outreach', 'Sander reads the Notion waitlist, Tom emails everyone on it', ORCHESTRATOR, 'shared', WAITLIST_TASKS);

  const waitlistId = await teamId('Waitlist Team');
  if (waitlistId) {
    await linkMember(waitlistId, await personaId('Sander'), 'researcher');
    await linkMember(waitlistId, await personaId('Tom'), 'outreach');
    const [[flowRow]] = await db.execute("SELECT id FROM agent_flows WHERE name='Waitlist Outreach'");
    if (flowRow) await db.execute('INSERT IGNORE INTO agent_team_flows (team_id, flow_id) VALUES (?,?)', [waitlistId, flowRow.id]);
  }

  // ── Marketing Room ────────────────────────────────────────────────────────
  await seedPersona('Alex Rivera', 'SEO Specialist',
    JSON.stringify(['habbo-mcp', 'task-coordinator', 'web-researcher']),
    'SEO Specialist — researches keywords and optimisation opportunities',
    `You are Alex Rivera, an SEO Specialist. Calm, data-driven, precise. You back every recommendation with search volume and difficulty data. Max 120 chars per talk_bot message.`, 'agent-m');

  await seedPersona('Sara Patel', 'Content Strategist',
    JSON.stringify(['habbo-mcp', 'task-coordinator']),
    'Content Strategist — turns keyword research into actionable content briefs',
    `You are Sara Patel, a Content Strategist. Structured, audience-focused, clear. You translate data into crisp briefs that writers can act on immediately. Max 120 chars per talk_bot message.`, 'agent-f');

  await seedPersona('Maya Chen', 'Copywriter',
    JSON.stringify(['habbo-mcp', 'task-coordinator']),
    'Copywriter — writes engaging content from briefs',
    `You are Maya Chen, a Copywriter. Creative, concise, persuasive. You write for humans first, search engines second. Max 120 chars per talk_bot message.`, 'agent-f');

  const MARKETING_TASKS = JSON.stringify([
    { id: 't1', title: 'Research target keywords', description: 'Identify 10 high-opportunity keywords for the given topic. Include search volume, difficulty, and search intent for each. Output as a structured list.', assign_to: 'Alex Rivera', depends_on: [] },
    { id: 't2', title: 'Create content brief', description: 'Using the keyword research from t1, create a detailed content brief: target keyword, secondary keywords, outline, word count, audience, tone, and CTA.', assign_to: 'Sara Patel', depends_on: ['t1'] },
    { id: 't3', title: 'Write article draft', description: 'Write a complete first draft of the article following the brief from t2. Include title, intro, all sections, and a conclusion. Optimise naturally for the primary keyword.', assign_to: 'Maya Chen', depends_on: ['t2'] }
  ]);
  await seedTeam('Marketing Room', 'Marketing', 'Research keywords, build a content brief, and write a full article draft — end-to-end content production.', ORCHESTRATOR, 'sequential', MARKETING_TASKS);

  const marketingId = await teamId('Marketing Room');
  if (marketingId) {
    await linkMember(marketingId, await personaId('Alex Rivera'), 'seo');
    await linkMember(marketingId, await personaId('Sara Patel'), 'strategy');
    await linkMember(marketingId, await personaId('Maya Chen'), 'copywriting');
  }

  // ── Sales Room ────────────────────────────────────────────────────────────
  await seedPersona('Marcus Webb', 'Sales Manager',
    JSON.stringify(['habbo-mcp', 'task-coordinator', 'web-researcher']),
    'Sales Manager — owns pipeline strategy and deal oversight',
    `You are Marcus Webb, a Sales Manager. Direct, strategic, results-oriented. You think in pipelines and conversion rates. Max 120 chars per talk_bot message.`, 'agent-m');

  await seedPersona('Priya Sharma', 'Business Development Rep',
    JSON.stringify(['habbo-mcp', 'email-outreach', 'task-coordinator', 'web-researcher']),
    'BDR — finds and qualifies new business opportunities',
    `You are Priya Sharma, a Business Development Rep. Energetic, persistent, empathetic. You open doors with genuine curiosity. Max 120 chars per talk_bot message.`, 'agent-f');

  await seedPersona('Daniel Park', 'Account Executive',
    JSON.stringify(['habbo-mcp', 'task-coordinator', 'web-researcher']),
    'Account Executive — runs deals from qualified lead to close',
    `You are Daniel Park, an Account Executive. Consultative, persuasive, detail-oriented. You close by understanding the customer\'s real problem. Max 120 chars per talk_bot message.`, 'agent-m');

  const SALES_TASKS = JSON.stringify([
    { id: 't1', title: 'Research and qualify target accounts', description: 'Identify 5 target companies that match the ICP. For each: company size, industry, pain points, key stakeholders, and why they are a good fit. Use available tools and web research.', assign_to: 'Priya Sharma', depends_on: [] },
    { id: 't2', title: 'Draft personalised outreach sequence', description: 'Using the accounts from t1, write a 3-touch outreach sequence (email + LinkedIn) for each top prospect. Personalise each message to their specific context.', assign_to: 'Priya Sharma', depends_on: ['t1'] },
    { id: 't3', title: 'Prepare demo and proposal for top prospect', description: 'Pick the highest-potential account from t1. Prepare a tailored demo agenda and a one-page proposal covering: their problem, our solution, expected ROI, and pricing.', assign_to: 'Daniel Park', depends_on: ['t1'] }
  ]);
  await seedTeam('Sales Room', 'Sales', 'Prospect target accounts, draft outreach sequences, and prepare a tailored demo and proposal.', ORCHESTRATOR, 'sequential', SALES_TASKS);

  const salesId = await teamId('Sales Room');
  if (salesId) {
    await linkMember(salesId, await personaId('Marcus Webb'), 'manager');
    await linkMember(salesId, await personaId('Priya Sharma'), 'bdr');
    await linkMember(salesId, await personaId('Daniel Park'), 'ae');
  }

  // ── Engineering Room ──────────────────────────────────────────────────────
  await seedPersona('Liam Torres', 'Backend Engineer',
    JSON.stringify(['habbo-mcp', 'jira-researcher', 'task-coordinator']),
    'Backend Engineer — designs and builds server-side systems',
    `You are Liam Torres, a Backend Engineer. Pragmatic, systematic, quality-focused. You write clean code with clear contracts. Max 120 chars per talk_bot message.`, 'agent-m');

  await seedPersona('Chloe Zhang', 'Frontend Engineer',
    JSON.stringify(['habbo-mcp', 'jira-researcher', 'task-coordinator']),
    'Frontend Engineer — builds the user-facing interface',
    `You are Chloe Zhang, a Frontend Engineer. Detail-oriented, user-empathetic, pixel-perfect. You care deeply about what users actually experience. Max 120 chars per talk_bot message.`, 'agent-f');

  await seedPersona('Ravi Nair', 'DevOps Engineer',
    JSON.stringify(['habbo-mcp', 'jira-researcher', 'sprint-coordinator', 'task-coordinator']),
    'DevOps Engineer — automates delivery and manages infrastructure',
    `You are Ravi Nair, a DevOps Engineer. Reliable, automation-first, incident-ready. You eliminate toil and keep systems running. Max 120 chars per talk_bot message.`, 'agent-m');

  const ENGINEERING_TASKS = JSON.stringify([
    { id: 't1', title: 'Design and implement the backend API', description: 'Define the data model and API contract. Implement the core endpoints with validation, error handling, and basic tests. Document the API shape clearly for the frontend.', assign_to: 'Liam Torres', depends_on: [] },
    { id: 't2', title: 'Build the frontend interface', description: 'Using the API contract from t1, implement the UI. Build the required components, wire up the API calls, handle loading and error states, and ensure mobile responsiveness.', assign_to: 'Chloe Zhang', depends_on: ['t1'] },
    { id: 't3', title: 'Set up deployment pipeline and infrastructure', description: 'Create a CI/CD pipeline that runs tests and deploys on merge. Provision the required cloud infrastructure. Add health checks and basic monitoring/alerting.', assign_to: 'Ravi Nair', depends_on: ['t2'] }
  ]);
  await seedTeam('Engineering Room', 'Engineering', 'Design the backend API, build the frontend, and set up deployment — full-stack delivery from spec to production.', ORCHESTRATOR, 'sequential', ENGINEERING_TASKS);

  const engineeringId = await teamId('Engineering Room');
  if (engineeringId) {
    await linkMember(engineeringId, await personaId('Liam Torres'), 'backend');
    await linkMember(engineeringId, await personaId('Chloe Zhang'), 'frontend');
    await linkMember(engineeringId, await personaId('Ravi Nair'), 'devops');
  }

  // ── Support Room ──────────────────────────────────────────────────────────
  await seedPersona('Elena Kovac', 'Customer Success Manager',
    JSON.stringify(['habbo-mcp', 'task-coordinator']),
    'Customer Success Manager — owns the customer relationship and long-term health',
    `You are Elena Kovac, a Customer Success Manager. Empathetic, proactive, relationship-driven. You anticipate problems before customers report them. Max 120 chars per talk_bot message.`, 'agent-f');

  await seedPersona('Omar Hassan', 'Support Specialist',
    JSON.stringify(['habbo-mcp', 'task-coordinator']),
    'Support Specialist — investigates and resolves customer issues',
    `You are Omar Hassan, a Support Specialist. Methodical, patient, thorough. You dig until you find the real cause. Max 120 chars per talk_bot message.`, 'agent-m');

  const SUPPORT_TASKS = JSON.stringify([
    { id: 't1', title: 'Triage and investigate the issue', description: 'Reproduce the reported problem, identify the root cause, and document your findings: what broke, why, and what the impact is. Propose a resolution or workaround.', assign_to: 'Omar Hassan', depends_on: [] },
    { id: 't2', title: 'Document resolution and update knowledge base', description: 'Based on the investigation from t1, write a clear resolution guide: steps taken, fix applied, and prevention advice. Format it as a knowledge base article.', assign_to: 'Omar Hassan', depends_on: ['t1'] },
    { id: 't3', title: 'Follow up with customer and confirm resolution', description: 'Draft a personalised follow-up message to the customer: summarise what happened, what was fixed, and any actions they should take. Confirm the issue is fully resolved.', assign_to: 'Elena Kovac', depends_on: ['t1'] }
  ]);
  await seedTeam('Support Room', 'Support', 'Investigate a customer issue, document the resolution, and follow up — end-to-end support handling.', ORCHESTRATOR, 'sequential', SUPPORT_TASKS);

  const supportId = await teamId('Support Room');
  if (supportId) {
    await linkMember(supportId, await personaId('Elena Kovac'), 'success');
    await linkMember(supportId, await personaId('Omar Hassan'), 'support');
  }

  // ── Analytics Room ────────────────────────────────────────────────────────
  await seedPersona('Kai Osei', 'Data Analyst',
    JSON.stringify(['habbo-mcp', 'task-coordinator', 'web-researcher']),
    'Data Analyst — pulls, cleans, and analyses data to surface insights',
    `You are Kai Osei, a Data Analyst. Curious, rigorous, sceptical of noise. You never present a number without context. Max 120 chars per talk_bot message.`, 'agent-m');

  await seedPersona('Luna Park', 'BI Developer',
    JSON.stringify(['habbo-mcp', 'task-coordinator']),
    'BI Developer — turns analysis into dashboards and reports',
    `You are Luna Park, a BI Developer. Visual, structured, stakeholder-aware. You make data understandable to anyone. Max 120 chars per talk_bot message.`, 'agent-f');

  const ANALYTICS_TASKS = JSON.stringify([
    { id: 't1', title: 'Pull and clean the raw data', description: 'Extract the required dataset using SQL or available tools. Clean it: handle nulls, remove duplicates, fix data types. Output a clean summary of what the dataset contains.', assign_to: 'Kai Osei', depends_on: [] },
    { id: 't2', title: 'Analyse data and identify key insights', description: 'Using the cleaned data from t1, run the analysis. Identify trends, anomalies, and patterns. Surface the top 5 actionable insights with supporting data.', assign_to: 'Kai Osei', depends_on: ['t1'] },
    { id: 't3', title: 'Build dashboard and present findings', description: 'Using the insights from t2, design a dashboard layout with the key metrics and charts. Write a one-page executive summary of the findings and recommendations.', assign_to: 'Luna Park', depends_on: ['t2'] }
  ]);
  await seedTeam('Analytics Room', 'Analytics', 'Pull raw data, run analysis to find insights, and deliver a dashboard with an executive summary.', ORCHESTRATOR, 'sequential', ANALYTICS_TASKS);

  const analyticsId = await teamId('Analytics Room');
  if (analyticsId) {
    await linkMember(analyticsId, await personaId('Kai Osei'), 'analyst');
    await linkMember(analyticsId, await personaId('Luna Park'), 'bi');
  }

  // ── Design Room ───────────────────────────────────────────────────────────
  await seedPersona('Theo Marchetti', 'UX Researcher',
    JSON.stringify(['habbo-mcp', 'task-coordinator', 'web-researcher']),
    'UX Researcher — uncovers user needs and maps the experience',
    `You are Theo Marchetti, a UX Researcher. Empathetic, curious, evidence-driven. You listen to users and translate what they say into what they mean. Max 120 chars per talk_bot message.`, 'agent-m');

  await seedPersona('Isla Fontaine', 'UI Designer',
    JSON.stringify(['habbo-mcp', 'task-coordinator']),
    'UI Designer — creates high-fidelity designs and visual assets',
    `You are Isla Fontaine, a UI Designer. Aesthetic, precise, system-minded. You design components that look great and scale. Max 120 chars per talk_bot message.`, 'agent-f');

  const DESIGN_TASKS = JSON.stringify([
    { id: 't1', title: 'Conduct user research and define requirements', description: 'Research the target users: their goals, pain points, and current workflow. Produce a summary with 3 user personas and the top 5 design requirements derived from the research.', assign_to: 'Theo Marchetti', depends_on: [] },
    { id: 't2', title: 'Create wireframes and user flow', description: 'Based on the requirements from t1, produce low-fidelity wireframes for the key screens and a user flow diagram showing how users move through the feature.', assign_to: 'Theo Marchetti', depends_on: ['t1'] },
    { id: 't3', title: 'Design high-fidelity mockups', description: 'Using the wireframes from t2, create polished high-fidelity mockups for the key screens. Apply the design system, ensure visual hierarchy, and annotate interactions.', assign_to: 'Isla Fontaine', depends_on: ['t2'] }
  ]);
  await seedTeam('Design Room', 'Design', 'Research users, create wireframes and user flows, then deliver high-fidelity mockups ready for development.', ORCHESTRATOR, 'sequential', DESIGN_TASKS);

  const designId = await teamId('Design Room');
  if (designId) {
    await linkMember(designId, await personaId('Theo Marchetti'), 'ux');
    await linkMember(designId, await personaId('Isla Fontaine'), 'ui');
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
app.set('trust proxy', 1);
// Plain HTTP local dev: disable HSTS and CSP (CSP can include upgrade-insecure-requests in defaults).
app.use(helmet({ hsts: false, contentSecurityPolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());


registerAuthRoutes(app, {
  db, authRequired, createHabboUser, issueAuthCookie,
  sendWelcomeEmail, sendPasswordResetEmail, createPasswordResetToken,
  sha256, getPortalUserByHabboUserId,
  PORTAL_RESET_TOKEN_TTL_MINUTES, PORTAL_PUBLIC_URL,
});

registerQrLoginRoutes(app, { db, authRequired, issueAuthCookie, sha256 });

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


registerAccountRoutes(app, {
  db, authRequired, getPortalUserByHabboUserId,
  encryptApiKey, decryptApiKey, maskApiKey,
});

registerInternalRoutes(app, {
  db, requireInternalSecret, mintHotelToken, apiKeys, decryptApiKey,
  resolvePersonaSkills, collectRequiredIntegrations, mcpClient,
});


registerMcpRoutes(app, {
  db, authRequired, getPortalUserByHabboUserId, sha256, encryptApiKey,
  createMcpToken, maskTokenPreview,
  PORTAL_MCP_TOKEN_TTL_DAYS, PORTAL_MCP_DEFAULT_TENANT,
});

// ─── User integrations (external MCP servers) ────────────────────────────────

// Parses, validates, and encrypts an stdio_config payload.
// Returns { encrypted } on success or { error } on failure.
function parseAndEncryptStdioConfig(raw) {
  let parsed;
  try { parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)); }
  catch { return { error: 'stdio_config must be valid JSON' }; }
  if (!parsed.command || typeof parsed.command !== 'string') {
    return { error: 'stdio_config.command must be a non-empty string' };
  }
  return { encrypted: encryptApiKey(JSON.stringify(parsed)) };
}

// ─── MCP HTTP probe: initialize + tools/list ──────────────────────────────────
async function probeMcpConnection(url, authHeaders = {}, timeoutMs = 6000) {
  const reqHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    ...authHeaders,
  };

  const initBody = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'habbo-agent', version: '1.0' },
    },
  });

  let initResult;
  try {
    const resp = await fetch(url, {
      method: 'POST', headers: reqHeaders, body: initBody,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (resp.status === 401 || resp.status === 403) {
      return { online: true, authenticated: false, tools: [], error: `Authentication failed (HTTP ${resp.status})` };
    }
    if (!resp.ok) {
      return { online: true, authenticated: false, tools: [], error: `Server returned HTTP ${resp.status}` };
    }

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch {
      // SSE or non-JSON transport — server is reachable but we can't introspect tools
      return { online: true, authenticated: true, tools: [], error: 'Non-JSON response (SSE transport — tools list not available)' };
    }

    if (data.error) {
      return { online: true, authenticated: false, tools: [], error: data.error.message || JSON.stringify(data.error) };
    }
    if (!data.result) {
      return { online: true, authenticated: false, tools: [], error: 'Unexpected response format from MCP server' };
    }
    initResult = data.result;
  } catch (err) {
    return { online: false, authenticated: false, tools: [], error: err.message };
  }

  // Probe tools/list
  const toolsBody = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  try {
    const resp = await fetch(url, {
      method: 'POST', headers: reqHeaders, body: toolsBody,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return { online: true, authenticated: true, tools: [], serverInfo: initResult };
    }
    const tools = (data.result?.tools ?? []).map(t => ({ name: t.name, description: t.description ?? '' }));
    return { online: true, authenticated: true, tools, serverInfo: initResult };
  } catch {
    return { online: true, authenticated: true, tools: [], serverInfo: initResult };
  }
}

// ─── MCP Registry proxy ───────────────────────────────────────────────────────
// Fetches from the official MCP Registry, filters to latest-version entries only,
// and accumulates pages until we have enough unique servers (or run out of pages).
// MCP registry browse route removed — curated integrations only.

registerFeedbackRoutes(app, { db, authRequired, permRequired, getPortalUserByHabboUserId });


registerHotelRoutes(app, {
  db, authRequired, rconCommand, findLiveBot,
  portalPkgVersion, distMainJsFingerprint,
  HABBO_BASE_URL, AI_SERVICE_URL, PORTAL_INTERNAL_SECRET, RCON_HOST, RCON_PORT,
});

registerSpawnSpotsRoutes(app, {
  db, authRequired, apiKeysRequired, getPortalUserByHabboUserId
});



// Quick RCON connectivity check — admin only, no side effects.
// Uses roomlivebots with a bogus room_id=0; the emulator rejects it cleanly with
// a proper JSON error, which proves the full request/response cycle works.
app.get('/api/rcon-status', authRequired, async (_req, res) => {
  try {
    const result = await rconCommand('roomlivebots', { room_id: 0 });
    res.json({ ok: true, host: RCON_HOST, port: RCON_PORT, response: result });
  } catch (e) {
    res.json({ ok: false, host: RCON_HOST, port: RCON_PORT, error: e?.message || String(e) });
  }
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

registerTierRequestRoutes(app, { db, authRequired, permRequired, getPortalUserByHabboUserId, sendUpgradeRequestNotification, sendUpgradeDecisionEmail });


registerAgentsRoutes(app, {
  db, authRequired, apiKeysRequired, permRequired, getPortalUserByHabboUserId,
  portalUserHasAnthropicApiKey, forwardToAgentTrigger, AGENT_TRIGGER_URL,
});

// ── User-scoped endpoints (/api/my/*) ─────────────────────────────────────────

// My Personas CRUD

async function forwardToAgentTrigger(payload) {
  const r = await fetch(`${AGENT_TRIGGER_URL}/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': PORTAL_INTERNAL_SECRET,
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}


// ── Marketplace install ───────────────────────────────────────────────────────
registerMarketplaceRoutes(app, {
  db, authRequired, permRequired, getPortalUserByHabboUserId,
  setDefaultUserTeamIfUnset, clearDefaultUserTeamIfPointsTo,
  deleteOrphanedForkedPersonas, SOLO_MARKETPLACE_ORCHESTRATOR,
});


registerSkillsRoutes(app, { authRequired, loadSkillsCatalog });


// ── Marketplace Export / Import (dev only) ────────────────────────────────────

registerDevRoutes(app, { db, authRequired, permRequired, getPortalUserByHabboUserId });


registerMyRoutes(app, {
  db, authRequired, apiKeysRequired, permRequired, getPortalUserByHabboUserId,
  encryptApiKey, decryptApiKey,
  parseAndEncryptStdioConfig, probeMcpConnection, checkSocketOnline,
  setDefaultUserTeamIfUnset, clearDefaultUserTeamIfPointsTo,
  deleteOrphanedForkedPersonas, portalUserHasAnthropicApiKey,
  forwardToAgentTrigger, detectRequiredIntegrations, mcpClient, AGENT_TRIGGER_URL,
});

// ── Voice Chat ───────────────────────────────────────────────────────────────

registerChatRoutes(app, {
  db, authRequired, getPortalUserByHabboUserId, apiKeys,
  forwardToAgentTrigger, AGENT_TRIGGER_URL, PORTAL_INTERNAL_SECRET,
  rconCommand,
});

const indexPath = path.join(__dirname, 'dist/index.html');

app.get('/', (req, res) => {
  const sessionUser = getSessionUser(req);
  const suffix = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return res.redirect(`${sessionUser ? '/app/home' : '/login'}${suffix}`);
});

app.get('/login', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (sessionUser) {
    const nextParam = typeof req.query.next === 'string' ? req.query.next : '';
    const safeNext = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/app/home';
    return res.redirect(safeNext);
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(indexPath);
});

// SPA shell for /app and deep links (/app/home, /app/marketplace, …) so refresh and shareable URLs work.
function sendAppSpa(req, res) {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return res.redirect('/login');
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(indexPath);
}
app.get(/^\/app(\/.*)?$/, sendAppSpa);
app.get(/^\/orchestration(\/.*)?$/, sendAppSpa);

// /scan-login is reached by a phone camera scanning the QR shown on another
// device — it must survive a full (non-SPA) page load, so unlike sendAppSpa
// the not-logged-in redirect preserves the original querystring (the ticket)
// via ?next=, so the user lands back here after logging in.
app.get(/^\/scan-login(\/.*)?$/, (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    const suffix = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(`/login?next=${encodeURIComponent('/scan-login' + suffix)}`);
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
