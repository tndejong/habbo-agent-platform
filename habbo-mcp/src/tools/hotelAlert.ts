import { sendRconCommand } from '../rcon.js';

export async function hotelAlert(params: {
  message: string;
  url?: string;
}): Promise<{ success: boolean; message: string }> {
  const { message, url = '' } = params;

  const response = await sendRconCommand('hotelalert', { message, url });

  if (response.status !== 0) {
    return { success: false, message: response.message || 'RCON error' };
  }
  return { success: true, message: `Hotel alert broadcast: "${message}"` };
}
