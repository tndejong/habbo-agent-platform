import * as net from 'net';
import { getConfig } from './config.js';

interface RconResponse {
  status: number;
  message: string;
}

export async function sendRconCommand(
  key: string,
  data: Record<string, unknown>
): Promise<RconResponse> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const payload = JSON.stringify({ key, data });
    let responseBuffer = '';

    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('RCON connection timed out'));
    }, 5000);

    const { host, port } = getConfig().rcon;
    client.connect(port, host, () => {
      client.write(payload);
    });

    client.on('data', (chunk) => {
      responseBuffer += chunk.toString();
    });

    client.on('close', () => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(responseBuffer) as RconResponse);
      } catch {
        reject(new Error(`Invalid RCON response: ${responseBuffer}`));
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
