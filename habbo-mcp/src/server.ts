import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { validateApiKey } from './auth.js';
import { createPlayer, generateSsoTicket } from './tools/createPlayer.js';
import { talkAsPlayer } from './tools/talkAsPlayer.js';
import { moveToRoom } from './tools/moveToRoom.js';
import { giveCredits } from './tools/giveCredits.js';
import { alertPlayer } from './tools/alertPlayer.js';
import { setMotto } from './tools/setMotto.js';
import { getOnlinePlayers } from './tools/getOnlinePlayers.js';
import { getChatLog } from './tools/getChatLog.js';
import { hotelAlert } from './tools/hotelAlert.js';
import { giveBadge } from './tools/giveBadge.js';
import { givePixels } from './tools/givePixels.js';
import { giveDiamonds } from './tools/giveDiamonds.js';
import { kickPlayer } from './tools/kickPlayer.js';
import { mutePlayer } from './tools/mutePlayer.js';
import { setRank } from './tools/setRank.js';
import { deployBot } from './tools/deployBot.js';
import { talkBot } from './tools/talkBot.js';
import { listBots } from './tools/listBots.js';
import { deleteBot } from './tools/deleteBot.js';

// ─── Input schemas ────────────────────────────────────────────────────────────

const CreatePlayerSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1).max(32),
  figure: z.string().optional(),
  gender: z.enum(['M', 'F']).optional(),
  motto: z.string().max(255).optional(),
});

const GenerateSsoTicketSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
});

const TalkAsPlayerSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  message: z.string().min(1).max(512),
  type: z.enum(['talk', 'whisper', 'shout']).optional(),
  bubble_id: z.number().int().optional(),
});

const MovePlayerToRoomSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  room_id: z.number().int().positive(),
});

const GiveCreditsSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  amount: z.number().int().min(1).max(1_000_000),
});

const AlertPlayerSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  message: z.string().min(1).max(1024),
});

const SetPlayerMottoSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  motto: z.string().max(255),
});

const GetOnlinePlayersSchema = z.object({
  api_key: z.string(),
  limit: z.number().int().min(1).max(200).optional(),
});

const GetRoomChatLogSchema = z.object({
  api_key: z.string(),
  room_id: z.number().int().positive(),
  limit: z.number().int().min(1).max(500).optional(),
});

const HotelAlertSchema = z.object({
  api_key: z.string(),
  message: z.string().min(1).max(1024),
  url: z.string().optional(),
});

const GiveBadgeSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  badge_code: z.string().min(1).max(12),
});

const GivePixelsSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  amount: z.number().int().min(1).max(10_000_000),
});

const GiveDiamondsSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  amount: z.number().int().min(1).max(10_000_000),
});

const KickPlayerSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
});

const MutePlayerSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  duration: z.number().int().min(1).max(86400),
});

const SetRankSchema = z.object({
  api_key: z.string(),
  username: z.string().min(1),
  rank: z.number().int().min(1).max(9),
});

const DeployBotSchema = z.object({
  api_key: z.string(),
  room_id: z.number().int().positive(),
  name: z.string().min(1).max(25),
  figure: z.string().optional(),
  gender: z.enum(['M', 'F']).optional(),
  motto: z.string().max(100).optional(),
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
});

const TalkBotSchema = z.object({
  api_key: z.string(),
  bot_id: z.number().int().positive(),
  message: z.string().min(1).max(512),
  type: z.enum(['talk', 'shout']).optional(),
});

const ListBotsSchema = z.object({
  api_key: z.string(),
});

const DeleteBotSchema = z.object({
  api_key: z.string(),
  bot_id: z.number().int().positive(),
});

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'create_habbo_player',
    description:
      'Create a new Habbo player account and return their user ID and a single-use SSO login URL. The player does not need to be online.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Unique username for the new player (max 32 chars)' },
        figure: {
          type: 'string',
          description: 'Habbo figure/look string (optional, defaults to a standard outfit)',
        },
        gender: {
          type: 'string',
          enum: ['M', 'F'],
          description: 'Gender of the player (M or F, default M)',
        },
        motto: { type: 'string', description: 'Player motto/bio (optional, max 255 chars)' },
      },
      required: ['api_key', 'username'],
    },
  },
  {
    name: 'generate_sso_ticket',
    description:
      'Generate a new single-use SSO login URL for an existing Habbo player. The player does not need to be online. Use this to let a player log in again.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the existing player' },
      },
      required: ['api_key', 'username'],
    },
  },
  {
    name: 'talk_as_player',
    description:
      'Make a Habbo player say something in their current room. The player must be online and in a room. Supports talk (normal), shout (caps bubble), and whisper modes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player to speak' },
        message: { type: 'string', description: 'The message to say (max 512 chars)' },
        type: {
          type: 'string',
          enum: ['talk', 'whisper', 'shout'],
          description: 'Speech type: talk (default), whisper, or shout',
        },
        bubble_id: {
          type: 'number',
          description: 'Chat bubble style ID (-1 = default)',
        },
      },
      required: ['api_key', 'username', 'message'],
    },
  },
  {
    name: 'move_player_to_room',
    description:
      'Teleport a Habbo player to a specific room by room ID. The player must be online. Note: the underlying RCON command has a known Java bug where it always returns status 2 even on success — the command is still sent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player to move' },
        room_id: { type: 'number', description: 'Target room ID (positive integer)' },
      },
      required: ['api_key', 'username', 'room_id'],
    },
  },
  {
    name: 'give_credits',
    description:
      'Give Habbo credits to a player. The player must be online to see the update reflected immediately (the RCON command requires an active session). Amount between 1 and 1,000,000.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player to receive credits' },
        amount: { type: 'number', description: 'Number of credits to give (1–1,000,000)' },
      },
      required: ['api_key', 'username', 'amount'],
    },
  },
  {
    name: 'alert_player',
    description:
      'Send a pop-up alert message to a specific Habbo player. The player must be online to receive the alert. Note: the RCON alertuser command always returns status 2 due to a Java bug — the alert is still delivered.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player to alert' },
        message: { type: 'string', description: 'The alert message to display (max 1024 chars)' },
      },
      required: ['api_key', 'username', 'message'],
    },
  },
  {
    name: 'set_player_motto',
    description:
      "Update a Habbo player's motto (profile tagline). The player should be online for the change to take effect in their live session.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player' },
        motto: { type: 'string', description: 'New motto text (max 255 chars)' },
      },
      required: ['api_key', 'username', 'motto'],
    },
  },
  {
    name: 'get_online_players',
    description:
      'List all players currently online in the Habbo hotel. Returns id, username, look, gender, motto, credits, and rank for each player. Does not require a player to be online.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        limit: {
          type: 'number',
          description: 'Maximum number of players to return (1–200, default 50)',
        },
      },
      required: ['api_key'],
    },
  },
  {
    name: 'get_room_chat_log',
    description:
      'Retrieve recent chat messages from a specific room, ordered oldest-first. Reads from the chatlogs_room database table. No player needs to be online.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        room_id: { type: 'number', description: 'Room ID to fetch chat log for' },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (1–500, default 100)',
        },
      },
      required: ['api_key', 'room_id'],
    },
  },
  {
    name: 'hotel_alert',
    description:
      'Broadcast a hotel-wide alert message to all players currently online. Optionally include a URL that players can click. No player needs to be specified.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        message: { type: 'string', description: 'The alert message to broadcast (max 1024 chars)' },
        url: {
          type: 'string',
          description: 'Optional URL to include with the alert (clickable link for players)',
        },
      },
      required: ['api_key', 'message'],
    },
  },
  {
    name: 'give_badge',
    description:
      'Give a badge to a Habbo player by badge code. Works whether the player is online or offline. If online, the badge is added to their inventory immediately.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player to receive the badge' },
        badge_code: { type: 'string', description: 'Badge code to give (e.g. "ADM", "ACH_Login1")' },
      },
      required: ['api_key', 'username', 'badge_code'],
    },
  },
  {
    name: 'give_pixels',
    description:
      'Give pixels (duckets) to a Habbo player. The player must be online for the update to take effect immediately.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player to receive pixels' },
        amount: { type: 'number', description: 'Number of pixels/duckets to give (1–10,000,000)' },
      },
      required: ['api_key', 'username', 'amount'],
    },
  },
  {
    name: 'give_diamonds',
    description:
      'Give diamonds (points/seasonal currency) to a Habbo player. The player must be online for the update to take effect immediately.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player to receive diamonds' },
        amount: { type: 'number', description: 'Number of diamonds to give (1–10,000,000)' },
      },
      required: ['api_key', 'username', 'amount'],
    },
  },
  {
    name: 'kick_player',
    description:
      'Disconnect and kick a player from the hotel. The player must be online. They can log back in immediately after.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player to kick' },
      },
      required: ['api_key', 'username'],
    },
  },
  {
    name: 'mute_player',
    description:
      'Mute a player so they cannot chat for a given duration. The player must be online.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player to mute' },
        duration: { type: 'number', description: 'Mute duration in seconds (1–86400, i.e. up to 24 hours)' },
      },
      required: ['api_key', 'username', 'duration'],
    },
  },
  {
    name: 'set_rank',
    description:
      'Set the rank/permission level of a Habbo player. Rank 1 is regular user, higher ranks grant more permissions (up to 9 for owner). The player does not need to be online.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        username: { type: 'string', description: 'Username of the player' },
        rank: { type: 'number', description: 'Rank level to assign (1–9)' },
      },
      required: ['api_key', 'username', 'rank'],
    },
  },
  {
    name: 'deploy_bot',
    description:
      'Create and deploy an NPC bot directly into a live room. The bot appears immediately as a visible avatar without needing a browser session. Returns the bot_id needed for talk_bot.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        room_id: { type: 'number', description: 'Room ID to place the bot in' },
        name: { type: 'string', description: 'Display name of the bot (max 25 chars)' },
        figure: { type: 'string', description: 'Habbo figure/look string (optional)' },
        gender: { type: 'string', enum: ['M', 'F'], description: 'Gender of the bot (default M)' },
        motto: { type: 'string', description: 'Bot motto (optional, max 100 chars)' },
        x: { type: 'number', description: 'Tile X position in the room (default 0)' },
        y: { type: 'number', description: 'Tile Y position in the room (default 0)' },
      },
      required: ['api_key', 'room_id', 'name'],
    },
  },
  {
    name: 'talk_bot',
    description:
      'Make an NPC bot say something in the room it is currently deployed in. The bot must be in a loaded room (someone must be in the room). Supports talk and shout.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        bot_id: { type: 'number', description: 'Bot ID returned by deploy_bot' },
        message: { type: 'string', description: 'Message to say (max 512 chars)' },
        type: { type: 'string', enum: ['talk', 'shout'], description: 'Speech type: talk (default) or shout' },
      },
      required: ['api_key', 'bot_id', 'message'],
    },
  },
  {
    name: 'list_bots',
    description: 'List all NPC bots in the hotel, including their room placement and position.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
      },
      required: ['api_key'],
    },
  },
  {
    name: 'delete_bot',
    description: 'Remove an NPC bot from the hotel by bot ID. The bot is deleted from the database.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key for authentication' },
        bot_id: { type: 'number', description: 'Bot ID to delete' },
      },
      required: ['api_key', 'bot_id'],
    },
  },
] as const;

// ─── Server factory ───────────────────────────────────────────────────────────

export async function startServer(): Promise<void> {
  const server = new Server(
    { name: 'habbo-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // ── List tools ──────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // ── Call tool ───────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        // ── create_habbo_player ─────────────────────────────────────────────
        case 'create_habbo_player': {
          const input = CreatePlayerSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await createPlayer({
            username: input.username,
            figure: input.figure,
            gender: input.gender,
            motto: input.motto,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // ── generate_sso_ticket ─────────────────────────────────────────────
        case 'generate_sso_ticket': {
          const input = GenerateSsoTicketSchema.parse(args);
          validateApiKey(input.api_key);
          const loginUrl = await generateSsoTicket(input.username);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ username: input.username, login_url: loginUrl }, null, 2),
              },
            ],
          };
        }

        // ── talk_as_player ──────────────────────────────────────────────────
        case 'talk_as_player': {
          const input = TalkAsPlayerSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await talkAsPlayer({
            username: input.username,
            message: input.message,
            type: input.type,
            bubble_id: input.bubble_id,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // ── move_player_to_room ─────────────────────────────────────────────
        case 'move_player_to_room': {
          const input = MovePlayerToRoomSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await moveToRoom({
            username: input.username,
            room_id: input.room_id,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // ── give_credits ────────────────────────────────────────────────────
        case 'give_credits': {
          const input = GiveCreditsSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await giveCredits({
            username: input.username,
            amount: input.amount,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // ── alert_player ────────────────────────────────────────────────────
        case 'alert_player': {
          const input = AlertPlayerSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await alertPlayer({
            username: input.username,
            message: input.message,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // ── set_player_motto ────────────────────────────────────────────────
        case 'set_player_motto': {
          const input = SetPlayerMottoSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await setMotto({
            username: input.username,
            motto: input.motto,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // ── get_online_players ──────────────────────────────────────────────
        case 'get_online_players': {
          const input = GetOnlinePlayersSchema.parse(args);
          validateApiKey(input.api_key);
          const players = await getOnlinePlayers({ limit: input.limit });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ count: players.length, players }, null, 2),
              },
            ],
          };
        }

        // ── get_room_chat_log ───────────────────────────────────────────────
        case 'get_room_chat_log': {
          const input = GetRoomChatLogSchema.parse(args);
          validateApiKey(input.api_key);
          const messages = await getChatLog({
            room_id: input.room_id,
            limit: input.limit,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { room_id: input.room_id, count: messages.length, messages },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // ── hotel_alert ─────────────────────────────────────────────────────
        case 'hotel_alert': {
          const input = HotelAlertSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await hotelAlert({
            message: input.message,
            url: input.url,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // ── give_badge ──────────────────────────────────────────────────────
        case 'give_badge': {
          const input = GiveBadgeSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await giveBadge({
            username: input.username,
            badge_code: input.badge_code,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── give_pixels ─────────────────────────────────────────────────────
        case 'give_pixels': {
          const input = GivePixelsSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await givePixels({
            username: input.username,
            amount: input.amount,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── give_diamonds ───────────────────────────────────────────────────
        case 'give_diamonds': {
          const input = GiveDiamondsSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await giveDiamonds({
            username: input.username,
            amount: input.amount,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── kick_player ─────────────────────────────────────────────────────
        case 'kick_player': {
          const input = KickPlayerSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await kickPlayer({ username: input.username });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── mute_player ─────────────────────────────────────────────────────
        case 'mute_player': {
          const input = MutePlayerSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await mutePlayer({
            username: input.username,
            duration: input.duration,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── set_rank ────────────────────────────────────────────────────────
        case 'set_rank': {
          const input = SetRankSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await setRank({
            username: input.username,
            rank: input.rank,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── deploy_bot ──────────────────────────────────────────────────────
        case 'deploy_bot': {
          const input = DeployBotSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await deployBot({
            room_id: input.room_id,
            name: input.name,
            figure: input.figure,
            gender: input.gender,
            motto: input.motto,
            x: input.x,
            y: input.y,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── talk_bot ────────────────────────────────────────────────────────
        case 'talk_bot': {
          const input = TalkBotSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await talkBot({
            bot_id: input.bot_id,
            message: input.message,
            type: input.type,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── list_bots ───────────────────────────────────────────────────────
        case 'list_bots': {
          const input = ListBotsSchema.parse(args);
          validateApiKey(input.api_key);
          const bots = await listBots();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ count: bots.length, bots }, null, 2) }],
          };
        }

        // ── delete_bot ──────────────────────────────────────────────────────
        case 'delete_bot': {
          const input = DeleteBotSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await deleteBot(input.bot_id);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── unknown tool ────────────────────────────────────────────────────
        default:
          return {
            content: [
              {
                type: 'text' as const,
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // ── Connect transport and run ───────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('habbo-mcp server running on stdio');
}
