#!/usr/bin/env node
/**
 * hotel_narrator.mjs — Claude Code PostToolUse / SubagentStart / SubagentStop hook
 *
 * 1. On SubagentStart  : parse the subagent's prompt for a known bot name
 *                        → write session_id → bot_name to /tmp/hotel-narrator-bots.json
 *                        → POST "arrival" message to agent-trigger /narrator
 *
 * 2. On PostToolUse    : look up bot for this session_id
 *                        → call Haiku to translate tool call → friendly Dutch sentence
 *                        → POST to agent-trigger /narrator (fire-and-forget, <1.5s)
 *
 * 3. On SubagentStop   : look up bot, POST "done" message, clean up session entry
 *
 * Always exits 0. Hard watchdog at 4.5s.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const EVENT_TYPE   = process.argv[2]; // post_tool_use | subagent_start | subagent_stop
const BOTS_MAP     = '/tmp/hotel-narrator-bots.json';
const NARRATOR_URL = 'http://localhost:3004/narrator';
const MAX_MS       = 4500;

const watchdog = setTimeout(() => process.exit(0), MAX_MS);

// Tools too noisy to narrate
const SKIP_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'LS', 'exit_plan_mode', 'ExitPlanMode', 'EnterPlanMode',
  'TodoRead', 'TodoWrite', 'Task', 'mcp__check_stop_signal',
]);

// Simple fallback templates (when Haiku is unavailable / times out)
const FALLBACK = {
  Write:      (n, i) => `${n} schrijft naar ${tail(i?.file_path ?? 'een bestand')}.`,
  Edit:       (n, i) => `${n} past ${tail(i?.file_path ?? 'een bestand')} aan.`,
  Bash:       (n, i) => `${n} voert uit: ${String(i?.command ?? '').slice(0, 50)}.`,
  WebFetch:   (n)    => `${n} zoekt informatie op het internet.`,
  WebSearch:  (n)    => `${n} doorzoekt het web.`,
  Agent:      (n)    => `${n} start een subtaak.`,
  NotebookEdit:(n)   => `${n} werkt een notebook bij.`,
};

function tail(p) { return String(p).split('/').slice(-2).join('/'); }

// ── Bots map helpers ─────────────────────────────────────────────────────────
// Format: { known_bots: ["Tom","Sander"], sessions: { "<session_id>": "Tom" } }

function readMap() {
  try {
    if (!existsSync(BOTS_MAP)) return { known_bots: [], sessions: {} };
    return JSON.parse(readFileSync(BOTS_MAP, 'utf-8'));
  } catch { return { known_bots: [], sessions: {} }; }
}

function writeMap(map) {
  try { writeFileSync(BOTS_MAP, JSON.stringify(map, null, 2), 'utf-8'); } catch {}
}

function botForSession(sessionId) {
  const m = readMap();
  return m.sessions?.[sessionId] ?? null;
}

function registerSession(sessionId, botName) {
  const m = readMap();
  m.sessions = m.sessions ?? {};
  m.sessions[sessionId] = botName;
  writeMap(m);
}

function unregisterSession(sessionId) {
  const m = readMap();
  delete m.sessions?.[sessionId];
  writeMap(m);
}

// Try to find a known bot name inside the raw payload string (subagent prompt contains it)
function detectBotInPayload(payloadStr) {
  const m = readMap();
  const known = m.known_bots ?? [];
  const lower = payloadStr.toLowerCase();
  return known.find(name => lower.includes(name.toLowerCase())) ?? null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();

  let payload = {};
  try { payload = JSON.parse(raw); } catch { payload = { raw }; }

  const sessionId = String(
    payload.session_id ?? payload.conversation_id ?? payload.sessionId ?? 'default'
  );

  if (EVENT_TYPE === 'subagent_start') {
    // Detect which persona this subagent is
    const botName = detectBotInPayload(raw);
    if (!botName) { clearTimeout(watchdog); process.exit(0); }

    registerSession(sessionId, botName);
    await postNarrator({
      event: 'subagent_start',
      bot_name: botName,
      session_id: sessionId,
      message: `${botName} is aangemeld en klaar voor de taak.`,
    });

  } else if (EVENT_TYPE === 'subagent_stop') {
    const botName = botForSession(sessionId);
    if (botName) {
      await postNarrator({
        event: 'subagent_stop',
        bot_name: botName,
        session_id: sessionId,
        message: `${botName} heeft de taak afgerond.`,
      });
    }
    unregisterSession(sessionId);

  } else if (EVENT_TYPE === 'post_tool_use') {
    const botName = botForSession(sessionId);
    if (!botName) { clearTimeout(watchdog); process.exit(0); }

    const toolName = String(payload.tool_name ?? payload.toolName ?? '');
    if (!toolName || SKIP_TOOLS.has(toolName)) { clearTimeout(watchdog); process.exit(0); }

    const message = await narrate(botName, toolName, payload.tool_input ?? {});
    if (!message) { clearTimeout(watchdog); process.exit(0); }

    await postNarrator({
      event: 'post_tool_use',
      bot_name: botName,
      session_id: sessionId,
      tool_name: toolName,
      message,
    });
  }

  clearTimeout(watchdog);
  process.exit(0);
}

// ── Narration ─────────────────────────────────────────────────────────────────

async function narrate(botName, toolName, toolInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const result = await callHaiku(apiKey, botName, toolName, toolInput);
    if (result) return result;
  }
  const tpl = FALLBACK[toolName];
  return tpl ? tpl(botName, toolInput) : null;
}

async function callHaiku(apiKey, botName, toolName, toolInput) {
  let detail = '';
  try {
    const i = typeof toolInput === 'object' && toolInput !== null ? toolInput : {};
    detail = String(i.command ?? i.file_path ?? i.path ?? i.url ?? i.prompt ?? i.query ?? '').slice(0, 80);
  } catch {}

  const prompt =
    `Jij bent ${botName}, een Habbo Hotel bot. Spreek in eerste persoon.\n` +
    `Vertel in MAXIMAAL 12 woorden wat je nu doet. Geen aanhalingstekens.\n` +
    `Tool: ${toolName}${detail ? `\nDetail: ${detail}` : ''}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text?.trim()?.slice(0, 240) || null;
  } catch {
    return null;
  }
}

// ── HTTP fire-and-forget to agent-trigger ─────────────────────────────────────

async function postNarrator(body) {
  try {
    await fetch(NARRATOR_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });
  } catch { /* best effort */ }
}

// ── Run ──────────────────────────────────────────────────────────────────────

main().catch(() => {
  clearTimeout(watchdog);
  process.exit(0);
});
