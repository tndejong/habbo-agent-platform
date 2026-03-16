import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

type HookEvent =
  | 'session_start'
  | 'session_end'
  | 'user_prompt_submit'
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'subagent_start'
  | 'subagent_stop'
  | 'stop';

interface HookState {
  byConversationId: Record<string, number>;
  subagentToConversation: Record<string, string>;
  recentEvents: Record<string, number>;
  lastConversationId: string | null;
}

type ToolFns = NonNullable<Awaited<ReturnType<typeof loadToolFns>>>;

const DEFAULT_OPERATOR = process.env.HABBO_HOOK_OPERATOR_USERNAME || 'Systemaccount';
const DEFAULT_BASE_X = Number.parseInt(process.env.HABBO_HOOK_SPAWN_X || '5', 10);
const DEFAULT_BASE_Y = Number.parseInt(process.env.HABBO_HOOK_SPAWN_Y || '5', 10);
const EVENT_DEDUPE_MS = 8_000;
const MAX_CHAT_LENGTH = 240;
const DEFAULT_STATE_FILE = path.join(os.homedir(), '.cursor', 'habbo-agent-hook-state.json');
const OFFSETS: Array<{ dx: number; dy: number }> = [
  { dx: 0, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: -1 },
  { dx: 2, dy: 0 },
  { dx: -2, dy: 0 },
  { dx: 0, dy: 2 },
  { dx: 0, dy: -2 },
];

async function main(): Promise<void> {
  loadEnvFile();

  if (process.env.HABBO_HOOK_ENABLED !== 'true') {
    return;
  }

  const event = normalizeEvent(process.argv[2]);
  if (!event) {
    return;
  }

  const payload = await readHookPayload();
  const stateFile = process.env.HABBO_HOOK_STATE_FILE || DEFAULT_STATE_FILE;
  const state = await readState(stateFile);
  const tools = await loadToolFns();
  if (!tools) {
    return;
  }

  switch (event) {
    case 'session_start':
      await speakAsOperator('Nieuwe agent sessie gestart.', tools);
      break;
    case 'session_end':
      await cleanupConversations(payload, state, tools);
      await speakAsOperator('Agent sessie afgerond.', tools);
      break;
    case 'user_prompt_submit':
      await handleUserPrompt(payload, state, tools);
      break;
    case 'pre_tool_use':
      await handleToolEvent('pre', payload, state, tools);
      break;
    case 'post_tool_use':
      await handleToolEvent('post', payload, state, tools);
      break;
    case 'subagent_start':
      await handleSubagentStart(payload, state, tools);
      break;
    case 'subagent_stop':
      await handleSubagentStop(payload, state, tools);
      break;
    case 'stop':
      await cleanupConversations(payload, state, tools);
      break;
    default:
      break;
  }

  await writeState(stateFile, state);
}

function loadEnvFile(): void {
  const thisFile = fileURLToPath(import.meta.url);
  const hooksDir = path.dirname(thisFile);
  const envPath = process.env.HABBO_HOOK_ENV_PATH || path.resolve(hooksDir, '../../.env');
  dotenv.config({ path: envPath, override: true });
}

function normalizeEvent(input?: string): HookEvent | null {
  const raw = (input || '').trim().toLowerCase();
  if (
    raw === 'session_start' ||
    raw === 'session_end' ||
    raw === 'user_prompt_submit' ||
    raw === 'pre_tool_use' ||
    raw === 'post_tool_use' ||
    raw === 'subagent_start' ||
    raw === 'subagent_stop' ||
    raw === 'stop'
  ) {
    return raw;
  }
  return null;
}

async function readHookPayload(): Promise<Record<string, unknown>> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { raw };
    }
  } catch {
    return {};
  }
}

async function readState(stateFile: string): Promise<HookState> {
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw) as HookState;
    return {
      byConversationId: parsed.byConversationId || {},
      subagentToConversation: parsed.subagentToConversation || {},
      recentEvents: parsed.recentEvents || {},
      lastConversationId: parsed.lastConversationId || null,
    };
  } catch {
    return {
      byConversationId: {},
      subagentToConversation: {},
      recentEvents: {},
      lastConversationId: null,
    };
  }
}

async function writeState(stateFile: string, state: HookState): Promise<void> {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

async function loadToolFns(): Promise<{
  talkAsPlayer: (params: { username: string; message: string; type?: 'talk' | 'whisper' | 'shout' }) => Promise<unknown>;
  talkBot: (params: { bot_id: number; message: string; type?: 'talk' | 'shout' }) => Promise<unknown>;
  getPlayerRoom: (username: string) => Promise<{ current_room_id: number | null; online: boolean }>;
  deployBot: (params: { room_id: number; name: string; x?: number; y?: number }) => Promise<{ bot_id: number }>;
  deleteBot: (botId: number) => Promise<unknown>;
  listBots: () => Promise<Array<{ id: number; room_id: number; x: number; y: number }>>;
} | null> {
  if (!process.env.MCP_API_KEY) {
    console.error('[habbo-hook] MCP_API_KEY missing, skipping hook action');
    return null;
  }

  const [{ talkAsPlayer }, { talkBot }, { getPlayerRoom }, { deployBot }, { deleteBot }, { listBots }] =
    await Promise.all([
      import('../tools/talkAsPlayer.js'),
      import('../tools/talkBot.js'),
      import('../tools/getPlayerRoom.js'),
      import('../tools/deployBot.js'),
      import('../tools/deleteBot.js'),
      import('../tools/listBots.js'),
    ]);

  return { talkAsPlayer, talkBot, getPlayerRoom, deployBot, deleteBot, listBots };
}

async function handleUserPrompt(
  payload: Record<string, unknown>,
  state: HookState,
  tools: ToolFns
): Promise<void> {
  const message = extractUserPrompt(payload);
  if (!message) {
    return;
  }
  const conversationId = resolveConversationId(payload, state);
  state.lastConversationId = conversationId;

  if (isDuplicate(`prompt:${conversationId}:${message}`, state)) {
    return;
  }

  const botId = await ensureConversationBot(conversationId, state, tools);
  if (botId) {
    await safeTalkBot(botId, message, tools);
  } else {
    await speakAsOperator(message, tools);
  }
}

async function handleSubagentStart(
  payload: Record<string, unknown>,
  state: HookState,
  tools: ToolFns
): Promise<void> {
  const subagentId = extractSubagentId(payload);
  const conversationId = resolveConversationId(payload, state);
  state.lastConversationId = conversationId;
  if (subagentId) {
    state.subagentToConversation[subagentId] = conversationId;
  }

  const botId = await ensureConversationBot(conversationId, state, tools);
  if (botId && subagentId) {
    const msg = `Subagent gestart (${subagentId.slice(0, 10)})`;
    if (!isDuplicate(`substart:${conversationId}:${subagentId}`, state)) {
      await safeTalkBot(botId, msg, tools);
    }
  }
}

async function handleSubagentStop(
  payload: Record<string, unknown>,
  state: HookState,
  tools: ToolFns
): Promise<void> {
  const subagentId = extractSubagentId(payload);
  if (!subagentId) {
    return;
  }
  const conversationId = state.subagentToConversation[subagentId] || resolveConversationId(payload, state);
  const botId = state.byConversationId[conversationId];
  if (botId && !isDuplicate(`substop:${conversationId}:${subagentId}`, state)) {
    await safeTalkBot(botId, 'Subagent klaar.', tools);
  }
  delete state.subagentToConversation[subagentId];
}

async function handleToolEvent(
  phase: 'pre' | 'post',
  payload: Record<string, unknown>,
  state: HookState,
  tools: ToolFns
): Promise<void> {
  if (!tools) {
    return;
  }
  const subagentId = extractSubagentId(payload);
  const toolName = extractToolName(payload);
  if (!toolName) {
    return;
  }
  const conversationId =
    (subagentId ? state.subagentToConversation[subagentId] : null) ||
    resolveConversationId(payload, state);
  state.lastConversationId = conversationId;
  if (subagentId && !state.subagentToConversation[subagentId]) {
    state.subagentToConversation[subagentId] = conversationId;
  }

  const botId = await ensureConversationBot(conversationId, state, tools);
  if (!botId) {
    return;
  }
  const dedupeKey = `${conversationId}:${subagentId || 'main'}:${phase}:${toolName}`;
  if (isDuplicate(dedupeKey, state)) {
    return;
  }

  const prefix = phase === 'pre' ? 'Gebruik tool' : 'Tool klaar';
  const message = `${prefix}: ${toolName}`.slice(0, MAX_CHAT_LENGTH);
  await safeTalkBot(botId, message, tools);
}

async function ensureConversationBot(
  conversationId: string,
  state: HookState,
  tools: ToolFns
): Promise<number | null> {
  const existing = state.byConversationId[conversationId];
  if (existing) {
    return existing;
  }

  const room = await tools.getPlayerRoom(DEFAULT_OPERATOR);
  if (!room.online || !room.current_room_id) {
    return null;
  }

  const spawn = await pickSpawnPosition(room.current_room_id, tools.listBots);
  const botName = toBotName(conversationId);
  const deployed = await tools.deployBot({
    room_id: room.current_room_id,
    name: botName,
    x: spawn.x,
    y: spawn.y,
  });
  state.byConversationId[conversationId] = deployed.bot_id;
  return deployed.bot_id;
}

async function cleanupConversations(
  payload: Record<string, unknown>,
  state: HookState,
  tools: ToolFns
): Promise<void> {
  const conversationId = extractConversationId(payload) || state.lastConversationId;
  if (conversationId && state.byConversationId[conversationId]) {
    await safeDeleteBot(state.byConversationId[conversationId], tools.deleteBot);
    delete state.byConversationId[conversationId];
    for (const [subId, convId] of Object.entries(state.subagentToConversation)) {
      if (convId === conversationId) {
        delete state.subagentToConversation[subId];
      }
    }
    return;
  }

  for (const botId of Object.values(state.byConversationId)) {
    await safeDeleteBot(botId, tools.deleteBot);
  }
  state.byConversationId = {};
  state.subagentToConversation = {};
}

async function safeDeleteBot(
  botId: number,
  deleteBot: (botId: number) => Promise<unknown>
): Promise<void> {
  try {
    await deleteBot(botId);
  } catch {
    // ignore cleanup errors
  }
}

function extractUserPrompt(payload: Record<string, unknown>): string | null {
  const candidates = [
    pickString(payload, 'prompt'),
    pickString(payload, 'message'),
    pickString(payload, 'user_prompt'),
    pickString(payload, 'input'),
    pickString(payload, 'raw'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const match = candidate.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
    const text = (match ? match[1] : candidate).replace(/\s+/g, ' ').trim();
    if (text) {
      return text.slice(0, MAX_CHAT_LENGTH);
    }
  }
  return null;
}

function extractSubagentId(payload: Record<string, unknown>): string | null {
  const direct = [
    pickString(payload, 'subagent_id'),
    pickString(payload, 'subagentId'),
    pickString(payload, 'agent_id'),
    pickString(payload, 'agentId'),
    pickString(payload, 'id'),
  ].find(Boolean);
  if (direct) {
    return sanitizeId(direct);
  }

  const raw = pickString(payload, 'raw');
  if (raw) {
    const match = raw.match(/subagent[_\s-]?id["'\s:=-]+([a-zA-Z0-9-]+)/i);
    if (match && match[1]) {
      return sanitizeId(match[1]);
    }
  }
  return null;
}

function resolveConversationId(payload: Record<string, unknown>, state: HookState): string {
  return extractConversationId(payload) || state.lastConversationId || `chat-${Date.now()}`;
}

function extractConversationId(payload: Record<string, unknown>): string | null {
  const direct = [
    pickString(payload, 'conversation_id'),
    pickString(payload, 'conversationId'),
    pickString(payload, 'session_id'),
    pickString(payload, 'sessionId'),
    pickString(payload, 'thread_id'),
    pickString(payload, 'threadId'),
    pickString(payload, 'chat_id'),
    pickString(payload, 'chatId'),
  ].find(Boolean);
  if (direct) {
    return sanitizeId(direct);
  }
  const raw = pickString(payload, 'raw');
  if (raw) {
    const match = raw.match(
      /(?:conversation[_\s-]?id|session[_\s-]?id|thread[_\s-]?id|chat[_\s-]?id)["'\s:=-]+([a-zA-Z0-9-]+)/i
    );
    if (match && match[1]) {
      return sanitizeId(match[1]);
    }
  }
  return null;
}

function extractToolName(payload: Record<string, unknown>): string | null {
  const direct = [
    pickString(payload, 'tool_name'),
    pickString(payload, 'toolName'),
    pickString(payload, 'tool'),
    pickString(payload, 'matcher'),
  ].find(Boolean);
  if (direct) {
    return direct.slice(0, 80);
  }

  const raw = pickString(payload, 'raw');
  if (raw) {
    const match = raw.match(/(?:tool[_\s-]?name|tool)["'\s:=-]+([a-zA-Z0-9_.:-]+)/i);
    if (match && match[1]) {
      return match[1].slice(0, 80);
    }
  }
  return null;
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_.]/g, '').slice(0, 64);
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' ? value : null;
}

function toBotName(subagentId: string): string {
  const suffix = subagentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return `Chat-${suffix || 'Hook'}`.slice(0, 25);
}

async function pickSpawnPosition(
  roomId: number,
  listBots: () => Promise<Array<{ id: number; room_id: number; x: number; y: number }>>
): Promise<{ x: number; y: number }> {
  const occupied = new Set<string>();
  try {
    const bots = await listBots();
    for (const bot of bots) {
      if (bot.room_id === roomId) {
        occupied.add(`${bot.x},${bot.y}`);
      }
    }
  } catch {
    // best effort only
  }

  const offsets = shuffle([...OFFSETS]);
  for (const offset of offsets) {
    const x = Math.max(0, DEFAULT_BASE_X + offset.dx);
    const y = Math.max(0, DEFAULT_BASE_Y + offset.dy);
    if (!occupied.has(`${x},${y}`)) {
      return { x, y };
    }
  }
  return { x: DEFAULT_BASE_X, y: DEFAULT_BASE_Y };
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function isDuplicate(key: string, state: HookState): boolean {
  const now = Date.now();
  for (const [k, ts] of Object.entries(state.recentEvents)) {
    if (now - ts > EVENT_DEDUPE_MS) {
      delete state.recentEvents[k];
    }
  }
  if (state.recentEvents[key] && now - state.recentEvents[key] <= EVENT_DEDUPE_MS) {
    return true;
  }
  state.recentEvents[key] = now;
  return false;
}

async function safeTalkBot(botId: number, message: string, tools: ToolFns): Promise<void> {
  try {
    await tools.talkBot({ bot_id: botId, message, type: 'talk' });
  } catch {
    // best effort
  }
}

async function speakAsOperator(message: string, tools: ToolFns): Promise<void> {
  try {
    await tools.talkAsPlayer({
      username: DEFAULT_OPERATOR,
      message: message.slice(0, MAX_CHAT_LENGTH),
      type: 'talk',
    });
  } catch {
    // best effort
  }
}

main().catch((err) => {
  console.error('[habbo-hook] fatal:', err);
  process.exit(1);
});
