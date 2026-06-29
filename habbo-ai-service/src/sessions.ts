import type { AIProvider, Message } from './providers/index.js';
import { fetchUserMcpTools, routeMcpToolCall } from './portal/portalClient.js';

const MAX_HISTORY = 20;

// Habbo chat doesn't render markdown — strip it and flatten newlines so
// responses read naturally in the hotel chat bubble.
function sanitizeForHabbo(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/#+\s/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface AgentSession {
  provider: AIProvider;
  persona: string;
  history: Message[];
  habboUserId: number;
}

const sessions = new Map<number, AgentSession>();

export function initSession(botId: number, provider: AIProvider, persona: string, habboUserId: number): void {
  sessions.set(botId, { provider, persona, history: [], habboUserId });
}

export function getSession(botId: number): AgentSession | undefined {
  return sessions.get(botId);
}

export function deleteSession(botId: number): void {
  sessions.delete(botId);
}

// Prepended to every persona so the AI always replies in plain chat-friendly text.
const HABBO_STYLE_INSTRUCTION =
  'IMPORTANT: You are chatting inside a virtual hotel game. ' +
  'Keep every reply SHORT (1-3 sentences max). ' +
  'Never use markdown, bullet points, numbered lists, bold, italic, or code blocks. ' +
  'Write in plain conversational sentences only.';

// Per-user tool cache keyed by habboUserId (in-memory, lost on restart).
const toolCache = new Map<number, { tools: any[]; fetchedAt: number }>();
const TOOL_CACHE_TTL_MS = 60_000;

async function getCachedTools(habboUserId: number) {
  const cached = toolCache.get(habboUserId);
  if (cached && Date.now() - cached.fetchedAt < TOOL_CACHE_TTL_MS) {
    return cached.tools;
  }
  const tools = await fetchUserMcpTools(habboUserId);
  toolCache.set(habboUserId, { tools, fetchedAt: Date.now() });
  return tools;
}

export async function chat(botId: number, username: string, message: string): Promise<string | null> {
  const session = sessions.get(botId);
  if (!session) return null;

  session.history.push({ role: 'user', content: `${username}: ${message}` });

  // Keep rolling window to avoid token bloat
  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(session.history.length - MAX_HISTORY);
  }

  const fullPersona = `${HABBO_STYLE_INSTRUCTION}\n\n${session.persona}`;
  const t0 = Date.now();

  try {
    // Check for MCP tools — use chatWithTools if any are available
    const tools = await getCachedTools(session.habboUserId);

    let raw: string;
    if (tools.length > 0) {
      raw = await session.provider.chatWithTools(
        session.history,
        fullPersona,
        tools,
        async (toolName, args) => {
          const result = await routeMcpToolCall(session.habboUserId, toolName, args);
          return result;
        },
      );
    } else {
      raw = await session.provider.chat(session.history, fullPersona);
    }

    const elapsed = Date.now() - t0;
    const reply = sanitizeForHabbo(raw);
    console.log(`[TIMING] sessions.chat bot=${botId} provider_ms=${elapsed} rawLen=${raw.length} replyLen=${reply.length} tools=${tools.length}`);

    session.history.push({ role: 'assistant', content: reply });

    return reply;
  } catch (err) {
    session.history.pop();
    throw err;
  }
}
