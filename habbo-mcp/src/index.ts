import './loadEnv.js';
import { getConfig } from './config.js';
import { startHttpServer, startStdioServer } from './server.js';
import { startSshTunnelIfEnabled } from './sshTunnel.js';

async function bootstrap(): Promise<void> {
  const tunnel = await startSshTunnelIfEnabled();

  const shutdownTunnel = () => {
    if (tunnel && !tunnel.killed) {
      tunnel.kill('SIGTERM');
    }
  };

  process.on('exit', shutdownTunnel);
  process.on('SIGINT', () => {
    shutdownTunnel();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    shutdownTunnel();
    process.exit(0);
  });

  const cfg = getConfig();

  if ((cfg.transport === 'stdio') || (cfg.transport === 'both')) {
    await startStdioServer();
  }

  if ((cfg.transport === 'http') || (cfg.transport === 'both')) {
    await startHttpServer();
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
