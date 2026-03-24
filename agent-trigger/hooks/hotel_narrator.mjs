#!/usr/bin/env node
/**
 * hotel_narrator.mjs — Claude Code hook: PreToolUse(Agent) / SubagentStart / PostToolUse / SubagentStop
 *
 * Bot linking flow:
 *   1. pre_agent_spawn (PreToolUse on Agent tool)
 *      Orchestrator is about to spawn a subagent. Read tool_input.prompt,
 *      detect the bot name, push to a PENDING QUEUE in the bots map.
 *
 *   2. subagent_start (SubagentStart)
 *      Subagent has started, we now have its session_id.
 *      Pop the oldest pending bot from the queue → write session_id → bot_name.
 *
 *   3. post_tool_use (PostToolUse)
 *      Look up bot for this session_id → translate via Haiku → narrate.
 *
 *   4. subagent_stop (SubagentStop)
 *      Farewell message, remove session mapping.
 *
 * Always exits 0. Hard watchdog at 4.5s.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const EVENT_TYPE   = process.argv[2];
const BOTS_MAP     = '/tmp/hotel-narrator-bots.json';
const NARRATOR_URL = 'http://localhost:3004/narrator';
const MAX_MS       = 4500;

const watchdog = setTimeout(() => process.exit(0), MAX_MS);

// Tools too noisy to narrate
const SKIP_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'LS', 'exit_plan_mode', 'ExitPlanMode', 'EnterPlanMode',
  'TodoRead', 'TodoWrite', 'Task', 'mcp__check_stop_signal', 'Agent',
]);

// Fallback templates when Haiku times out
const FALLBACK = {
  Write:       (n, i) => `${n} schrijft naar ${tail(i?.file_path ?? 'een bestand')}.`,
  Edit:        (n, i) => `${n} past ${tail(i?.file_path ?? 'een bestand')} aan.`,
  Bash:        (n, i) => `${n} voert uit: ${String(i?.command ?? '').slice(0, 50)}.`,
  WebFetch:    (n)    => `${n} zoekt informatie op het internet.`,
  WebSearch:   (n)    => `${n} doorzoekt het web.`,
  NotebookEdit:(n)    => `${n} werkt een notebook bij.`,
};

function tail(p) { return String(p).split('/').slice(-2).join('/'); }

// ── Bots map ─────────────────────────────────────────────────────────────────
// Format:
// {
//   known_bots: ["Tom", "Sander"],
//   pending:    ["Tom"],            ← FIFO queue: pre_agent_spawn pushes, subagent_start pops
//   sessions:   { "<session_id>": "Tom" }
// }

function readMap() {
  try {
    if (!existsSync(BOTS_MAP)) return { known_bots: [], pending: [], sessions: {} };
    const m = JSON.parse(readFileSync(BOTS_MAP, 'utf-8'));
    m.pending  = m.pending  ?? [];
    m.sessions = m.sessions ?? {};
    return m;
  } catch { return { known_bots: [], pending: [], sessions: {} }; }
}

function writeMap(m) {
  try { writeFileSync(BOTS_MAP, JSON.stringify(m, null, 2), 'utf-8'); } catch {}
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

  if (EVENT_TYPE === 'pre_agent_spawn') {
    // Orchestrator is about to spawn a subagent — detect bot name from prompt
    const prompt = String(
      payload.tool_input?.prompt ?? payload.tool_input?.description ?? ''
    );
    const map = readMap();
    const botName = findBotInText(prompt, map.known_bots);
    if (botName) {
      map.pending.push(botName);
      writeMap(map);
    }

  } else if (EVENT_TYPE === 'subagent_start') {
    // New subagent started — pop from pending queue, assign to this session
    const map = readMap();
    // First try pending queue (most reliable), fall back to scanning raw payload
    const botName = map.pending.shift() ?? findBotInText(raw, map.known_bots);
    if (!botName) { clearTimeout(watchdog); process.exit(0); }

    map.sessions[sessionId] = botName;
    writeMap(map);

    await postNarrator({
      event: 'subagent_start',
      bot_name: botName,
      session_id: sessionId,
      message: `${botName} is aangemeld en klaar voor de taak.`,
    });

  } else if (EVENT_TYPE === 'subagent_stop') {
    const map = readMap();
    const botName = map.sessions[sessionId];
    if (botName) {
      await postNarrator({
        event: 'subagent_stop',
        bot_name: botName,
        session_id: sessionId,
        message: `${botName} heeft de taak afgerond.`,
      });
      delete map.sessions[sessionId];
      writeMap(map);
    }

  } else if (EVENT_TYPE === 'post_tool_use') {
    const botName = readMap().sessions[sessionId];
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

// ── Bot name detection ────────────────────────────────────────────────────────

function findBotInText(text, knownBots = []) {
  if (!text || !knownBots.length) return null;
  const lower = text.toLowerCase();
  return knownBots.find(name => lower.includes(name.toLowerCase())) ?? null;
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
  } catch { return null; }
}

// ── POST to agent-trigger /narrator ──────────────────────────────────────────

async function postNarrator(body) {
  const userMcpToken = process.env.USER_MCP_TOKEN || '';
  try {
    await fetch(NARRATOR_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, ...(userMcpToken ? { mcp_token: userMcpToken } : {}) }),
      signal: AbortSignal.timeout(1500),
    });
  } catch { /* best effort */ }
}

// ── Run ──────────────────────────────────────────────────────────────────────

main().catch(() => { clearTimeout(watchdog); process.exit(0); });
