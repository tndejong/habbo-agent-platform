import { execSync, spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';

type TunnelConfig = {
  host: string;
  port: number;
  user: string;
  keyPath?: string;
  strictHostKeyChecking: string;
  connectTimeoutSec: number;
  localRconPort: number;
  remoteRconHost: string;
  remoteRconPort: number;
  localDbPort: number;
  remoteDbHost: string;
  remoteDbPort: number;
};

function toInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }
  return parsed;
}

function loadConfig(): TunnelConfig {
  return {
    host: process.env.SSH_TUNNEL_HOST || '',
    port: toInt('SSH_TUNNEL_PORT', 22),
    user: process.env.SSH_TUNNEL_USER || '',
    keyPath: process.env.SSH_TUNNEL_KEY_PATH || undefined,
    strictHostKeyChecking: process.env.SSH_TUNNEL_STRICT_HOST_KEY_CHECKING || 'accept-new',
    connectTimeoutSec: toInt('SSH_TUNNEL_CONNECT_TIMEOUT_SEC', 10),
    localRconPort: toInt('SSH_TUNNEL_LOCAL_RCON_PORT', 43001),
    remoteRconHost: process.env.SSH_TUNNEL_REMOTE_RCON_HOST || '127.0.0.1',
    remoteRconPort: toInt('SSH_TUNNEL_REMOTE_RCON_PORT', 13001),
    localDbPort: toInt('SSH_TUNNEL_LOCAL_DB_PORT', 43306),
    remoteDbHost: process.env.SSH_TUNNEL_REMOTE_DB_HOST || '127.0.0.1',
    remoteDbPort: toInt('SSH_TUNNEL_REMOTE_DB_PORT', 13306),
  };
}

function waitForLocalPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for local forwarded port ${port}`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });
}

function applyLocalEnv(cfg: TunnelConfig): void {
  process.env.RCON_HOST = '127.0.0.1';
  process.env.RCON_PORT = String(cfg.localRconPort);
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = String(cfg.localDbPort);
}

/** Returns true if the port is already in use (e.g. by another tunnel). */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer(() => {});
    server.once('error', (err: NodeJS.ErrnoException) => {
      resolve(err.code === 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

/** Kill processes listening on the given port (e.g. stale ssh tunnel). No-op if none or on error. */
function killProcessesOnPort(port: number): void {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid, 10), 'SIGTERM');
      } catch {
        // process may already be gone
      }
    }
    if (pids.length > 0) {
      process.stderr.write(`[ssh-tunnel] freed port ${port} (killed PID(s): ${pids.join(', ')})\n`);
    }
  } catch {
    // lsof returns non-zero when no process found; ignore
  }
}

export async function startSshTunnelIfEnabled(): Promise<ChildProcess | null> {
  if (process.env.SSH_TUNNEL_ENABLED !== 'true') {
    return null;
  }

  const cfg = loadConfig();
  if (!cfg.host?.trim() || !cfg.user?.trim()) {
    process.stderr.write(
      '[ssh-tunnel] SSH_TUNNEL_ENABLED=true but SSH_TUNNEL_HOST or SSH_TUNNEL_USER is missing in habbo-mcp/.env. Tunnel disabled; using RCON/DB from .env (local or existing).\n'
    );
    return null;
  }

  let [rconInUse, dbInUse] = await Promise.all([
    isPortInUse(cfg.localRconPort),
    isPortInUse(cfg.localDbPort),
  ]);
  if (rconInUse || dbInUse) {
    killProcessesOnPort(cfg.localRconPort);
    killProcessesOnPort(cfg.localDbPort);
    await new Promise((r) => setTimeout(r, 500));
    [rconInUse, dbInUse] = await Promise.all([
      isPortInUse(cfg.localRconPort),
      isPortInUse(cfg.localDbPort),
    ]);
  }
  if (rconInUse || dbInUse) {
    const ports = [rconInUse && cfg.localRconPort, dbInUse && cfg.localDbPort]
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `SSH tunnel ports still in use (${ports}) after clearing. Set different ports in habbo-mcp/.env: SSH_TUNNEL_LOCAL_RCON_PORT and SSH_TUNNEL_LOCAL_DB_PORT.`
    );
  }

  const args: string[] = [
    '-N',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    `StrictHostKeyChecking=${cfg.strictHostKeyChecking}`,
    '-o',
    `ConnectTimeout=${cfg.connectTimeoutSec}`,
    '-L',
    `${cfg.localRconPort}:${cfg.remoteRconHost}:${cfg.remoteRconPort}`,
    '-L',
    `${cfg.localDbPort}:${cfg.remoteDbHost}:${cfg.remoteDbPort}`,
  ];

  if (cfg.keyPath) {
    args.push('-i', cfg.keyPath);
  }

  args.push(`${cfg.user}@${cfg.host}`);

  const proc = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  proc.stdout?.on('data', (chunk) => {
    process.stderr.write(`[ssh-tunnel] ${String(chunk)}`);
  });
  proc.stderr?.on('data', (chunk) => {
    const s = String(chunk);
    stderr += s;
    process.stderr.write(`[ssh-tunnel] ${s}`);
  });

  const timeoutMs = toInt('SSH_TUNNEL_START_TIMEOUT_MS', 30000);

  const tunnelReady = new Promise<ChildProcess>((resolve, reject) => {
    proc.once('error', (err) => {
      reject(new Error(`SSH tunnel failed to start: ${err.message}`));
    });
    proc.once('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        const hint = /already in use|Address already in use/i.test(stderr)
          ? ` Port ${cfg.localRconPort} or ${cfg.localDbPort} may be in use. Set SSH_TUNNEL_LOCAL_RCON_PORT / SSH_TUNNEL_LOCAL_DB_PORT in habbo-mcp/.env to free ports, or kill the process using them.`
          : '';
        reject(new Error(`SSH tunnel exited with code ${code}.${hint}`));
      }
    });

    Promise.all([
      waitForLocalPort(cfg.localRconPort, timeoutMs),
      waitForLocalPort(cfg.localDbPort, timeoutMs),
    ])
      .then(() => {
        applyLocalEnv(cfg);
        process.stderr.write(
          `[ssh-tunnel] SSH tunnel active: local 127.0.0.1:${cfg.localRconPort} -> ${cfg.host}:${cfg.remoteRconPort} (RCON), local 127.0.0.1:${cfg.localDbPort} -> ${cfg.host}:${cfg.remoteDbPort} (DB)\n`
        );
        resolve(proc);
      })
      .catch(reject);
  });

  return tunnelReady;
}
