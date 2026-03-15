import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getPlayerRoom } from '../tools/getPlayerRoom.js';
import { deployBot } from '../tools/deployBot.js';
import { talkBot } from '../tools/talkBot.js';
import { talkAsPlayer } from '../tools/talkAsPlayer.js';
import { deleteBot } from '../tools/deleteBot.js';
import { listBots } from '../tools/listBots.js';

interface FileState {
  offset: number;        
  buffer: string;
  initialized: boolean;
}

interface BotState {
  botId: number;
  pendingMessages: string[];
  lastTalkAt: number;
  lastActivityAt: number;
}

interface TranscriptLine {
  role?: string;
  message?: {
    content?: Array<{ type?: string; text?: string }>;
  };
}

const MAX_ASSISTANT_MESSAGE = 180;
const MAX_USER_MESSAGE = 240;
const USER_DEDUPE_WINDOW_MS = 60_000;
const RECENT_SUBAGENT_WINDOW_MS = 60_000;
const SPAWN_OFFSETS: Array<{ dx: number; dy: number }> = [
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
const SKIP_SCAN_DIRS = new Set(['node_modules', '.git', 'dist', '.next']);

export function startAgentHotelSync(): void {
  if (!config.sync.enabled) {
    return;
  }

  const sync = new AgentHotelSync();
  sync.start().catch((err) => {
    console.error('[agent-sync] failed to start:', err);
  });
}

class AgentHotelSync {
  private readonly fileState = new Map<string, FileState>();
  private readonly checkpointOffsets = new Map<string, number>();
  private readonly botState = new Map<string, BotState>();
  private readonly spawnAttempts = new Map<string, number>();
  private readonly recentForwardedUserMessages = new Map<string, number>();
  private startedAtMs = Date.now();
  private tickInProgress = false;

  async start(): Promise<void> {
    await this.loadCheckpoint();
    console.error('[agent-sync] enabled, watching:', config.sync.transcriptsRoot);
    setInterval(() => this.tick(), config.sync.pollMs).unref();
    setInterval(() => this.flushAndCleanup(), 1000).unref();
  }

  private async tick(): Promise<void> {
    if (this.tickInProgress) {
      return;
    }
    this.tickInProgress = true;
    try {
      const files = await this.listTranscriptFiles(config.sync.transcriptsRoot);
      for (const filePath of files) {
        await this.handleTranscriptFile(filePath);
      }
      await this.saveCheckpoint();
    } catch (err) {
      console.error('[agent-sync] tick error:', this.formatError(err));
    } finally {
      this.tickInProgress = false;
    }
  }

  private async flushAndCleanup(): Promise<void> {
    const now = Date.now();
    for (const [filePath, state] of this.botState) {
      if (state.pendingMessages.length > 0 && now - state.lastTalkAt >= config.sync.talkIntervalMs) {
        const nextMessage = state.pendingMessages.shift();
        if (nextMessage) {
          try {
            await talkBot({ bot_id: state.botId, message: nextMessage, type: 'talk' });
            state.lastTalkAt = Date.now();
            // Treat successful speech as activity so cleanup waits long enough.
            state.lastActivityAt = state.lastTalkAt;
          } catch (err) {
            state.pendingMessages.unshift(nextMessage);
            // keep moving; room might be unloaded briefly
            console.error('[agent-sync] talk_bot failed:', this.formatError(err));
          }
        }
      }

      const idleTooLong = now - state.lastActivityAt >= config.sync.doneIdleMs;
      const enoughTimeSinceLastTalk =
        state.lastTalkAt === 0 || now - state.lastTalkAt >= config.sync.talkIntervalMs;
      if (idleTooLong && enoughTimeSinceLastTalk && state.pendingMessages.length === 0) {
        try {
          await deleteBot(state.botId);
        } catch (err) {
          console.error('[agent-sync] delete_bot failed:', this.formatError(err));
        }
        this.botState.delete(filePath);
      }
    }
  }

  private async handleTranscriptFile(filePath: string): Promise<void> {
    const isSubagent = filePath.includes(`${path.sep}subagents${path.sep}`);
    const isPrimary = this.isPrimaryConversationFile(filePath);
    if (!isSubagent && !isPrimary) {
      return;
    }

    const stats = await fs.stat(filePath);
    const state = this.fileState.get(filePath) ?? {
      offset: this.checkpointOffsets.get(filePath) ?? 0,
      buffer: '',
      initialized: false,
    };

    if (!state.initialized) {
      if (!this.checkpointOffsets.has(filePath)) {
        const recentSubagent = isSubagent && stats.mtimeMs >= this.startedAtMs - RECENT_SUBAGENT_WINDOW_MS;
        state.offset = recentSubagent ? 0 : stats.size;
      }
      state.initialized = true;
      this.fileState.set(filePath, state);
      if (state.offset >= stats.size) {
        return;
      }
    }

    if (stats.size <= state.offset) {
      return;
    }

    const bytesToRead = stats.size - state.offset;
    const fd = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(bytesToRead);
      await fd.read(buffer, 0, bytesToRead, state.offset);
      state.offset = stats.size;
      state.buffer += buffer.toString('utf8');
    } finally {
      await fd.close();
    }

    const lines = state.buffer.split('\n');
    state.buffer = lines.pop() ?? '';
    this.fileState.set(filePath, state);
    this.checkpointOffsets.set(filePath, state.offset);

    for (const line of lines) {
      await this.handleTranscriptLine(filePath, line, isSubagent, isPrimary);
    }
  }

  private async handleTranscriptLine(
    filePath: string,
    line: string,
    isSubagent: boolean,
    isPrimary: boolean
  ): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(trimmed) as TranscriptLine;
    } catch {
      return;
    }

    if (isPrimary && parsed.role === 'user' && config.sync.forwardUserChat) {
      const message = this.extractUserText(parsed);
      if (message && !this.shouldSkipDuplicateUserChat(filePath, message)) {
        try {
          await talkAsPlayer({
            username: config.sync.operatorUsername,
            message,
            type: 'talk',
          });
        } catch (err) {
          console.error('[agent-sync] talk_as_player failed:', this.formatError(err));
        }
      }
    }

    if (parsed.role !== 'assistant' || (!isSubagent && !isPrimary)) {
      return;
    }

    const messages = this.extractAssistantMessages(parsed);
    if (messages.length === 0) {
      return;
    }

    const bot = await this.ensureBotForFile(filePath);
    if (!bot) {
      return;
    }

    for (const message of messages) {
      bot.pendingMessages.push(message);
    }
    bot.lastActivityAt = Date.now();
  }

  private async ensureBotForFile(filePath: string): Promise<BotState | null> {
    const existing = this.botState.get(filePath);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const lastAttempt = this.spawnAttempts.get(filePath) ?? 0;
    if (now - lastAttempt < config.sync.spawnRetryMs) {
      return null;
    }
    this.spawnAttempts.set(filePath, now);

    const subagentId = path.basename(filePath, '.jsonl');
    const botName = this.toBotName(subagentId);

    try {
      const room = await getPlayerRoom(config.sync.operatorUsername);
      const roomId = room.current_room_id;
      if (!room.online || !roomId) {
        throw new Error(
          `Operator "${config.sync.operatorUsername}" must be online in a room`
        );
      }

      const spawn = await this.pickSpawnPosition(roomId);
      const deployed = await deployBot({
        room_id: roomId,
        name: botName,
        x: spawn.x,
        y: spawn.y,
      });

      const created: BotState = {
        botId: deployed.bot_id,
        pendingMessages: [],
        lastTalkAt: 0,
        lastActivityAt: Date.now(),
      };
      this.botState.set(filePath, created);
      return created;
    } catch (err) {
      console.error('[agent-sync] deploy bot failed:', this.formatError(err));
      return null;
    }
  }

  private extractAssistantMessages(entry: TranscriptLine): string[] {
    const content = entry.message?.content;
    if (!Array.isArray(content)) {
      return [];
    }
    const raw = content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    if (!raw) {
      return [];
    }
    const normalized = raw.replace(/\s+/g, ' ').trim();
    return this.splitIntoChatMessages(normalized, MAX_ASSISTANT_MESSAGE);
  }

  private extractUserText(entry: TranscriptLine): string | null {
    const content = entry.message?.content;
    if (!Array.isArray(content)) {
      return null;
    }
    const raw = content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    if (!raw) {
      return null;
    }
    const match = raw.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
    const normalized = (match ? match[1] : raw).replace(/\s+/g, ' ').trim();
    return normalized ? normalized.slice(0, MAX_USER_MESSAGE) : null;
  }

  private shouldSkipDuplicateUserChat(filePath: string, text: string): boolean {
    const now = Date.now();
    for (const [k, seenAt] of this.recentForwardedUserMessages) {
      if (now - seenAt > USER_DEDUPE_WINDOW_MS) {
        this.recentForwardedUserMessages.delete(k);
      }
    }
    const key = `${filePath}:${text}`;
    const seen = this.recentForwardedUserMessages.get(key);
    if (seen && now - seen <= USER_DEDUPE_WINDOW_MS) {
      return true;
    }
    this.recentForwardedUserMessages.set(key, now);
    return false;
  }

  private async pickSpawnPosition(roomId: number): Promise<{ x: number; y: number }> {
    const baseX = Math.max(0, config.sync.spawnX);
    const baseY = Math.max(0, config.sync.spawnY);
    const occupied = new Set<string>();

    try {
      const bots = await listBots();
      for (const bot of bots) {
        if (bot.room_id === roomId) {
          occupied.add(`${bot.x},${bot.y}`);
        }
      }
    } catch {
      // best-effort only
    }

    const offsets = this.shuffle([...SPAWN_OFFSETS]);
    for (const offset of offsets) {
      const x = Math.max(0, baseX + offset.dx);
      const y = Math.max(0, baseY + offset.dy);
      if (!occupied.has(`${x},${y}`)) {
        return { x, y };
      }
    }

    return { x: baseX, y: baseY };
  }

  private isPrimaryConversationFile(filePath: string): boolean {
    if (filePath.includes(`${path.sep}subagents${path.sep}`)) {
      return false;
    }
    const parent = path.basename(path.dirname(filePath));
    const base = path.basename(filePath, '.jsonl');
    return parent.length > 0 && parent === base;
  }

  private toBotName(subagentId: string): string {
    const suffix = subagentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return `Agent-${suffix || 'Runner'}`.slice(0, 25);
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  private splitIntoChatMessages(text: string, maxLength: number): string[] {
    if (!text) {
      return [];
    }
    if (text.length <= maxLength) {
      return [text];
    }

    const words = text.split(' ').filter(Boolean);
    const chunks: string[] = [];
    let current = '';

    for (const word of words) {
      if (word.length > maxLength) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        let start = 0;
        while (start < word.length) {
          chunks.push(word.slice(start, start + maxLength));
          start += maxLength;
        }
        continue;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxLength) {
        current = candidate;
      } else {
        if (current) {
          chunks.push(current);
        }
        current = word;
      }
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  private async listTranscriptFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const absolutePath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_SCAN_DIRS.has(entry.name)) {
            continue;
          }
          stack.push(absolutePath);
        } else if (entry.isFile() && absolutePath.endsWith('.jsonl')) {
          if (!absolutePath.includes(`${path.sep}agent-transcripts${path.sep}`)) {
            continue;
          }
          files.push(absolutePath);
        }
      }
    }
    return files;
  }

  private async loadCheckpoint(): Promise<void> {
    try {
      const raw = await fs.readFile(config.sync.checkpointFile, 'utf8');
      const parsed = JSON.parse(raw) as { files?: Record<string, number> };
      for (const [file, offset] of Object.entries(parsed.files ?? {})) {
        if (Number.isFinite(offset) && offset >= 0) {
          this.checkpointOffsets.set(file, offset);
        }
      }
    } catch {
      // first run
    }
  }

  private async saveCheckpoint(): Promise<void> {
    const dir = path.dirname(config.sync.checkpointFile);
    await fs.mkdir(dir, { recursive: true });
    const payload = { files: Object.fromEntries(this.checkpointOffsets.entries()) };
    await fs.writeFile(config.sync.checkpointFile, JSON.stringify(payload, null, 2), 'utf8');
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
