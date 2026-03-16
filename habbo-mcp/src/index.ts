import './loadEnv.js';
import { startServer } from './server.js';
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

  await startServer();
}

bootstrap().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
