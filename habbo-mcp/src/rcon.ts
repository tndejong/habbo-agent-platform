import * as net from 'node:net';
import { getConfig } from './config.js';
import { log } from './log.js';
import { rconCallDuration, rconErrorsTotal } from './metrics.js';

export interface RconResponse {
  status: number;
  message: string;
}

const RETRYABLE_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED']);
const RETRYABLE_MARKERS = new Set(['TIMEOUT', 'CLOSED_EMPTY']);

type Waiter = (slot: PoolSlot) => void;

interface PoolSlot {
  id: number;
}

class RconPool {
  private inUse = new Set<number>();
  private waiters: Waiter[] = [];
  private nextId = 1;
  private warnTimer: NodeJS.Timeout | null = null;

  constructor(private max: number) {}

  async acquire(): Promise<PoolSlot> {
    if (this.inUse.size < this.max) {
      const slot = { id: this.nextId++ };
      this.inUse.add(slot.id);
      this.armWarn();
      return slot;
    }
    return new Promise<PoolSlot>((resolve) => {
      this.waiters.push((slot) => resolve(slot));
    });
  }

  release(slot: PoolSlot): void {
    const next = this.waiters.shift();
    if (next) {
      // Hand the slot directly to the next waiter — keeps in-use count stable.
      next(slot);
      return;
    }
    this.inUse.delete(slot.id);
    if (this.inUse.size === 0 && this.warnTimer) {
      clearTimeout(this.warnTimer);
      this.warnTimer = null;
    }
  }

  private armWarn(): void {
    if (this.warnTimer) return;
    this.warnTimer = setTimeout(() => {
      if (this.inUse.size >= this.max) {
        log.warn({ inUse: this.inUse.size, waiters: this.waiters.length }, 'rcon pool saturated');
      }
      this.warnTimer = null;
    }, 30_000);
    // Don't block process exit on the warning timer.
    this.warnTimer.unref?.();
  }
}

let pool: RconPool | null = null;
function getPool(): RconPool {
  if (!pool) pool = new RconPool(getConfig().rcon.poolMax);
  return pool;
}

function classifyError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code || '');
    if (code) return code;
  }
  if (err instanceof Error) {
    if (err.message.includes('timed out')) return 'TIMEOUT';
    if (err.message.includes('closed empty')) return 'CLOSED_EMPTY';
    if (err.message.startsWith('Invalid RCON response')) return 'INVALID_RESPONSE';
    return err.name || 'ERROR';
  }
  return 'UNKNOWN';
}

function isRetryable(kind: string): boolean {
  return RETRYABLE_CODES.has(kind) || RETRYABLE_MARKERS.has(kind);
}

function singleAttempt(key: string, payload: string): Promise<RconResponse> {
  const cfg = getConfig().rcon;

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let buffer = '';

    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error(`RCON timed out after ${cfg.timeoutMs}ms (key=${key})`));
    }, cfg.timeoutMs);

    client.connect(cfg.port, cfg.host, () => {
      client.write(payload);
    });

    client.on('data', (chunk) => {
      buffer += chunk.toString();
    });

    client.on('close', () => {
      clearTimeout(timeout);
      if (!buffer.length) {
        const err = new Error(`RCON connection closed empty (key=${key}, host=${cfg.host}, port=${cfg.port})`);
        reject(err);
        return;
      }
      try {
        resolve(JSON.parse(buffer) as RconResponse);
      } catch {
        const preview = buffer.length > 300 ? `${buffer.slice(0, 300)}...` : buffer;
        reject(new Error(`Invalid RCON response: ${preview} (key=${key}, bytes=${buffer.length})`));
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function sendRconCommand(
  key: string,
  data: Record<string, unknown>
): Promise<RconResponse> {
  const cfg = getConfig().rcon;
  const payload = JSON.stringify({ key, data });
  const slot = await getPool().acquire();
  const startedAt = Date.now();
  let attempts = 0;

  try {
    let lastError: unknown = null;
    while (attempts <= cfg.retries) {
      attempts++;
      const attemptStart = Date.now();
      try {
        const response = await singleAttempt(key, payload);
        rconCallDuration.observe({ key, outcome: 'ok' }, (Date.now() - attemptStart) / 1000);
        log.debug(
          { key, elapsed_ms: Date.now() - startedAt, status: response.status, attempts },
          'rcon ok'
        );
        return response;
      } catch (err) {
        const kind = classifyError(err);
        rconCallDuration.observe({ key, outcome: 'error' }, (Date.now() - attemptStart) / 1000);
        rconErrorsTotal.inc({ kind });
        lastError = err;
        log.warn(
          { key, kind, attempt: attempts, elapsed_ms: Date.now() - startedAt },
          'rcon attempt failed'
        );
        if (!isRetryable(kind) || attempts > cfg.retries) break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  } finally {
    getPool().release(slot);
  }
}

// TCP connect-only probe — checks that the emulator's RCON listener is reachable
// without sending a command that could have side-effects.
export async function pingRcon(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const cfg = getConfig().rcon;
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      resolve({ ok: false, latency_ms: Date.now() - startedAt, error: 'TIMEOUT' });
    }, Math.min(cfg.timeoutMs, 2000));
    client.once('connect', () => {
      clearTimeout(timeout);
      client.end();
      resolve({ ok: true, latency_ms: Date.now() - startedAt });
    });
    client.once('error', (err) => {
      clearTimeout(timeout);
      client.destroy();
      resolve({ ok: false, latency_ms: Date.now() - startedAt, error: err.message });
    });
    client.connect(cfg.port, cfg.host);
  });
}
