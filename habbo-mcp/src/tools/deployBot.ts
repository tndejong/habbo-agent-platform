import { sendRconCommand } from '../rcon.js';
import { resolveFigureByType } from './figureTypes.js';

export async function deployBot(params: {
  room_id: number;
  name: string;
  figure?: string;
  figure_type?: string;
  gender?: 'M' | 'F';
  motto?: string;
  x?: number;
  y?: number;
  freeroam?: boolean;
}): Promise<{ bot_id: number; name: string; room_id: number }> {
  const resolvedFigure =
    params.figure ||
    (params.figure_type ? await resolveFigureByType(params.figure_type) : await resolveFigureByType('default'));
  if (!resolvedFigure) {
    throw new Error(`Unknown figure_type "${params.figure_type}". Use list_figure_types to see available keys.`);
  }

  const freeroam = params.freeroam ?? true;
  const response = await sendRconCommand('deploybot', {
    room_id: params.room_id,
    name: params.name,
    figure: resolvedFigure,
    gender: params.gender ?? 'M',
    motto: params.motto ?? '',
    x: params.x ?? 0,
    y: params.y ?? 0,
    freeroam,
  });

  if (response.status !== 0) {
    throw new Error(`Failed to deploy bot: ${response.message}`);
  }

  const botId = parseInt(response.message, 10);
  return { bot_id: botId, name: params.name, room_id: params.room_id };
}
