import type { AIProvider, Message } from './providers/index.js';

const MAX_HISTORY = 20;

// Habbo chat doesn't render markdown — strip it and flatten newlines so
// responses read naturally in the hotel chat bubble.
function sanitizeForHabbo(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')        // *italic* → italic
    .replace(/__(.+?)__/g, '$1')        // __bold__ → bold
    .replace(/_(.+?)_/g, '$1')          // _italic_ → italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // `code` / ```block``` → removed
    .replace(/#+\s/g, '')               // ## Heading → removed
    .replace(/\n+/g, ' ')               // newlines → space
    .replace(/\s{2,}/g, ' ')            // collapse double spaces
    .trim();
}

export interface AgentSession {
  provider: AIProvider;
  persona: string;
  history: Message[];
}

const sessions = new Map<number, AgentSession>();

export function initSession(botId: number, provider: AIProvider, persona: string): void {
  sessions.set(botId, { provider, persona, history: [] });
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

export async function chat(botId: number, username: string, message: string): Promise<string | null> {
  const session = sessions.get(botId);
  if (!session) return null;

  session.history.push({ role: 'user', content: `${username}: ${message}` });

  // Keep rolling window to avoid token bloat
  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(session.history.length - MAX_HISTORY);
  }

  const fullPersona = `${HABBO_STYLE_INSTRUCTION}\n\n${session.persona}`;
  const raw = await session.provider.chat(session.history, fullPersona);
  const reply = sanitizeForHabbo(raw);

  session.history.push({ role: 'assistant', content: reply });

  return reply;
}
