import { z } from 'zod';

import type { ToolDefinition } from './types.js';

import { createPlayer, generateSsoTicket } from './createPlayer.js';
import { talkAsPlayer } from './talkAsPlayer.js';
import { moveToRoom } from './moveToRoom.js';
import { giveCredits } from './giveCredits.js';
import { alertPlayer } from './alertPlayer.js';
import { setMotto } from './setMotto.js';
import { getPlayerRoom } from './getPlayerRoom.js';
import { getOnlinePlayers } from './getOnlinePlayers.js';
import { getChatLog } from './getChatLog.js';
import { hotelAlert } from './hotelAlert.js';
import { giveBadge } from './giveBadge.js';
import { givePixels } from './givePixels.js';
import { giveDiamonds } from './giveDiamonds.js';
import { kickPlayer } from './kickPlayer.js';
import { mutePlayer } from './mutePlayer.js';
import { setRank } from './setRank.js';
import { deployBot } from './deployBot.js';
import { talkBot } from './talkBot.js';
import { listBots } from './listBots.js';
import { deleteBot } from './deleteBot.js';
import { listFigureTypes, registerFigureType, validateFigure } from './figureTypes.js';

const apiKeyProp = { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' } as const;

const createPlayerTool: ToolDefinition = {
  name: 'create_habbo_player',
  description:
    'Create a new Habbo player account and return their user ID and a single-use SSO login URL. The player does not need to be online.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Unique username for the new player (max 32 chars)' },
      figure: { type: 'string', description: 'Habbo figure/look string (optional, defaults to a standard outfit)' },
      gender: { type: 'string', enum: ['M', 'F'], description: 'Gender of the player (M or F, default M)' },
      motto: { type: 'string', description: 'Player motto/bio (optional, max 255 chars)' },
    },
    required: ['username'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1).max(32),
    figure: z.string().optional(),
    gender: z.enum(['M', 'F']).optional(),
    motto: z.string().max(255).optional(),
  }),
  handler: (input) =>
    createPlayer({ username: input.username, figure: input.figure, gender: input.gender, motto: input.motto }),
};

const generateSsoTicketTool: ToolDefinition = {
  name: 'generate_sso_ticket',
  description:
    'Generate a fresh single-use SSO login URL for an existing player so an external system can sign them in to the Habbo client.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the existing player' },
    },
    required: ['username'],
  },
  zod: z.object({ api_key: z.string().optional(), username: z.string().min(1) }),
  handler: async (input) => ({ username: input.username, login_url: await generateSsoTicket(input.username) }),
};

const talkAsPlayerTool: ToolDefinition = {
  name: 'talk_as_player',
  description: 'Make a player speak, whisper or shout in their current room. The player must be online.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player to speak' },
      message: { type: 'string', description: 'Message to say (max 512 chars)' },
      type: { type: 'string', enum: ['talk', 'whisper', 'shout'] },
      bubble_id: { type: 'number' },
    },
    required: ['username', 'message'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    message: z.string().min(1).max(512),
    type: z.enum(['talk', 'whisper', 'shout']).optional(),
    bubble_id: z.number().int().optional(),
  }),
  handler: (input) =>
    talkAsPlayer({ username: input.username, message: input.message, type: input.type, bubble_id: input.bubble_id }),
};

const movePlayerToRoomTool: ToolDefinition = {
  name: 'move_player_to_room',
  description: 'Teleport an online player to a given room.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player to move' },
      room_id: { type: 'number', description: 'Target room ID' },
    },
    required: ['username', 'room_id'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    room_id: z.coerce.number().int().positive(),
  }),
  handler: (input) => moveToRoom({ username: input.username, room_id: input.room_id }),
};

const giveCreditsTool: ToolDefinition = {
  name: 'give_credits',
  description: 'Give credits to an online player.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player to receive credits' },
      amount: { type: 'number', description: 'Amount of credits (1 — 1,000,000)' },
    },
    required: ['username', 'amount'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    amount: z.number().int().min(1).max(1_000_000),
  }),
  handler: (input) => giveCredits({ username: input.username, amount: input.amount }),
};

const alertPlayerTool: ToolDefinition = {
  name: 'alert_player',
  description: 'Send a system alert popup to an online player.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player to alert' },
      message: { type: 'string', description: 'Alert message body' },
    },
    required: ['username', 'message'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    message: z.string().min(1).max(1024),
  }),
  handler: (input) => alertPlayer({ username: input.username, message: input.message }),
};

const setPlayerMottoTool: ToolDefinition = {
  name: 'set_player_motto',
  description: 'Set a player\'s motto/bio.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player' },
      motto: { type: 'string', description: 'New motto (max 255 chars)' },
    },
    required: ['username', 'motto'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    motto: z.string().max(255),
  }),
  handler: (input) => setMotto({ username: input.username, motto: input.motto }),
};

const getPlayerRoomTool: ToolDefinition = {
  name: 'get_player_room',
  description: 'Get the current room (if any) of a player.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player' },
    },
    required: ['username'],
  },
  zod: z.object({ api_key: z.string().optional(), username: z.string().min(1) }),
  handler: (input) => getPlayerRoom(input.username),
};

const getOnlinePlayersTool: ToolDefinition = {
  name: 'get_online_players',
  description: 'List players currently online in the hotel.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      limit: { type: 'number', description: 'Max players to return (1—200, default 50)' },
    },
    required: [],
  },
  zod: z.object({ api_key: z.string().optional(), limit: z.number().int().min(1).max(200).optional() }),
  handler: async (input) => {
    const players = await getOnlinePlayers({ limit: input.limit });
    return { count: players.length, players };
  },
};

const getRoomChatLogTool: ToolDefinition = {
  name: 'get_room_chat_log',
  description: 'Get the most recent chat log entries for a room.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      room_id: { type: 'number', description: 'Room ID' },
      limit: { type: 'number', description: 'Max entries to return (1—500, default 100)' },
    },
    required: ['room_id'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    room_id: z.coerce.number().int().positive(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
  handler: async (input) => {
    const messages = await getChatLog({ room_id: input.room_id, limit: input.limit });
    return { room_id: input.room_id, count: messages.length, messages };
  },
};

const hotelAlertTool: ToolDefinition = {
  name: 'hotel_alert',
  description: 'Broadcast a hotel-wide alert to every online user.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      message: { type: 'string', description: 'Alert message body' },
      url: { type: 'string', description: 'Optional URL to attach' },
    },
    required: ['message'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    message: z.string().min(1).max(1024),
    url: z.string().optional(),
  }),
  handler: (input) => hotelAlert({ message: input.message, url: input.url }),
};

const giveBadgeTool: ToolDefinition = {
  name: 'give_badge',
  description: 'Award a badge to a player.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player to receive the badge' },
      badge_code: { type: 'string', description: 'Badge code (max 12 chars)' },
    },
    required: ['username', 'badge_code'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    badge_code: z.string().min(1).max(12),
  }),
  handler: (input) => giveBadge({ username: input.username, badge_code: input.badge_code }),
};

const givePixelsTool: ToolDefinition = {
  name: 'give_pixels',
  description: 'Give pixels (duckets) to a player.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player to receive pixels' },
      amount: { type: 'number', description: 'Amount of pixels (1 — 10,000,000)' },
    },
    required: ['username', 'amount'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    amount: z.number().int().min(1).max(10_000_000),
  }),
  handler: (input) => givePixels({ username: input.username, amount: input.amount }),
};

const giveDiamondsTool: ToolDefinition = {
  name: 'give_diamonds',
  description: 'Give diamonds to a player.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player to receive diamonds' },
      amount: { type: 'number', description: 'Amount of diamonds (1 — 10,000,000)' },
    },
    required: ['username', 'amount'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    amount: z.number().int().min(1).max(10_000_000),
  }),
  handler: (input) => giveDiamonds({ username: input.username, amount: input.amount }),
};

const kickPlayerTool: ToolDefinition = {
  name: 'kick_player',
  description: 'Disconnect a player from the hotel.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player to kick' },
    },
    required: ['username'],
  },
  zod: z.object({ api_key: z.string().optional(), username: z.string().min(1) }),
  handler: (input) => kickPlayer({ username: input.username }),
};

const mutePlayerTool: ToolDefinition = {
  name: 'mute_player',
  description: 'Mute a player for a duration in seconds.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player to mute' },
      duration: { type: 'number', description: 'Mute duration in seconds (1—86400)' },
    },
    required: ['username', 'duration'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    duration: z.number().int().min(1).max(86400),
  }),
  handler: (input) => mutePlayer({ username: input.username, duration: input.duration }),
};

const setRankTool: ToolDefinition = {
  name: 'set_rank',
  description: 'Change a player\'s rank (1—9).',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      username: { type: 'string', description: 'Username of the player' },
      rank: { type: 'number', description: 'New rank (1—9)' },
    },
    required: ['username', 'rank'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    username: z.string().min(1),
    rank: z.number().int().min(1).max(9),
  }),
  handler: (input) => setRank({ username: input.username, rank: input.rank }),
};

const deployBotTool: ToolDefinition = {
  name: 'deploy_bot',
  description: 'Spawn a bot in a room with a given figure, name, and starting tile.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      room_id: { type: 'number', description: 'Target room ID' },
      name: { type: 'string', description: 'Display name of the bot (max 25 chars)' },
      figure: { type: 'string', description: 'Figure string (optional; falls back to figure_type)' },
      figure_type: { type: 'string', description: 'Named figure preset' },
      gender: { type: 'string', enum: ['M', 'F'] },
      motto: { type: 'string', description: 'Optional motto (max 100 chars)' },
      x: { type: 'number' },
      y: { type: 'number' },
      freeroam: { type: 'boolean', description: 'Allow the bot to wander (default true)' },
    },
    required: ['room_id', 'name'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    room_id: z.coerce.number().int().positive(),
    name: z.string().min(1).max(25),
    figure: z.string().optional(),
    figure_type: z.string().min(2).max(40).optional(),
    gender: z.enum(['M', 'F']).optional(),
    motto: z.string().max(100).optional(),
    x: z.coerce.number().int().min(0).optional(),
    y: z.coerce.number().int().min(0).optional(),
    freeroam: z.boolean().optional(),
  }),
  handler: (input) => deployBot(input),
};

const talkBotTool: ToolDefinition = {
  name: 'talk_bot',
  description:
    'Make an NPC bot say something in the room it is currently deployed in. The bot must be in a loaded room. Supports talk and shout.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      bot_id: { type: 'number', description: 'Bot ID returned by deploy_bot' },
      message: { type: 'string', description: 'Message to say (max 512 chars)' },
      type: { type: 'string', enum: ['talk', 'shout'] },
    },
    required: ['bot_id', 'message'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    bot_id: z.coerce.number().int().positive(),
    message: z.string().min(1).max(512),
    type: z.enum(['talk', 'shout']).optional(),
  }),
  handler: (input) => talkBot({ bot_id: input.bot_id, message: input.message, type: input.type }),
};

const listBotsTool: ToolDefinition = {
  name: 'list_bots',
  description: 'List all NPC bots in the hotel, including their room placement and position.',
  inputSchema: {
    type: 'object',
    properties: { api_key: apiKeyProp },
    required: [],
  },
  zod: z.object({ api_key: z.string().optional() }),
  handler: async () => {
    const bots = await listBots();
    return { count: bots.length, bots };
  },
};

const deleteBotTool: ToolDefinition = {
  name: 'delete_bot',
  description: 'Remove an NPC bot from the hotel by bot ID. The bot is deleted from the database.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      bot_id: { type: 'number', description: 'Bot ID to delete' },
    },
    required: ['bot_id'],
  },
  zod: z.object({ api_key: z.string().optional(), bot_id: z.coerce.number().int().positive() }),
  handler: (input) => deleteBot(input.bot_id),
};

const validateFigureTool: ToolDefinition = {
  name: 'validate_figure',
  description: 'Validate a Habbo figure string against the figuredata and report any issues.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      figure: { type: 'string', description: 'Figure string to validate' },
      gender: { type: 'string', enum: ['M', 'F'] },
    },
    required: ['figure'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    figure: z.string().min(1).max(1024),
    gender: z.enum(['M', 'F']).optional(),
  }),
  handler: (input) => validateFigure(input.figure, input.gender),
};

const registerFigureTypeTool: ToolDefinition = {
  name: 'register_figure_type',
  description: 'Register a custom named figure preset that can later be referenced by figure_type.',
  inputSchema: {
    type: 'object',
    properties: {
      api_key: apiKeyProp,
      figure_type: { type: 'string', description: 'Name of the figure preset' },
      figure: { type: 'string', description: 'Figure string for the preset' },
      gender: { type: 'string', enum: ['M', 'F'] },
      overwrite: { type: 'boolean', description: 'Overwrite an existing preset with the same name' },
    },
    required: ['figure_type', 'figure'],
  },
  zod: z.object({
    api_key: z.string().optional(),
    figure_type: z.string().min(2).max(40),
    figure: z.string().min(1).max(1024),
    gender: z.enum(['M', 'F']).optional(),
    overwrite: z.boolean().optional(),
  }),
  handler: (input) =>
    registerFigureType({
      figure_type: input.figure_type,
      figure: input.figure,
      gender: input.gender,
      overwrite: input.overwrite,
    }),
};

const listFigureTypesTool: ToolDefinition = {
  name: 'list_figure_types',
  description: 'List all available figure_type keys (builtin + custom) and their resolved figure strings.',
  inputSchema: {
    type: 'object',
    properties: { api_key: apiKeyProp },
    required: [],
  },
  zod: z.object({ api_key: z.string().optional() }),
  handler: async () => {
    const types = await listFigureTypes();
    return { count: types.length, types };
  },
};

export const ALL_TOOLS: ToolDefinition[] = [
  createPlayerTool,
  generateSsoTicketTool,
  talkAsPlayerTool,
  movePlayerToRoomTool,
  giveCreditsTool,
  alertPlayerTool,
  setPlayerMottoTool,
  getPlayerRoomTool,
  getOnlinePlayersTool,
  getRoomChatLogTool,
  hotelAlertTool,
  giveBadgeTool,
  givePixelsTool,
  giveDiamondsTool,
  kickPlayerTool,
  mutePlayerTool,
  setRankTool,
  deployBotTool,
  talkBotTool,
  listBotsTool,
  deleteBotTool,
  validateFigureTool,
  registerFigureTypeTool,
  listFigureTypesTool,
];

export const TOOL_BY_NAME = new Map<string, ToolDefinition>(ALL_TOOLS.map((tool) => [tool.name, tool]));
