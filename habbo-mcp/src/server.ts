import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  assertToolAllowed,
  canUseTool,
  extractApiToken,
  logToolCall,
  markTokenUsed,
  resolvePrincipal,
  validateApiKey,
} from './auth.js';
import { getConfig } from './config.js';
import { createPlayer, generateSsoTicket } from './tools/createPlayer.js';
import { talkAsPlayer } from './tools/talkAsPlayer.js';
import { moveToRoom } from './tools/moveToRoom.js';
import { giveCredits } from './tools/giveCredits.js';
import { alertPlayer } from './tools/alertPlayer.js';
import { setMotto } from './tools/setMotto.js';
import { getPlayerRoom } from './tools/getPlayerRoom.js';
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
import { listFigureTypes, registerFigureType, validateFigure } from './tools/figureTypes.js';

// ─── Input schemas ────────────────────────────────────────────────────────────

const CreatePlayerSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1).max(32),
  figure: z.string().optional(),
  gender: z.enum(['M', 'F']).optional(),
  motto: z.string().max(255).optional(),
});

const GenerateSsoTicketSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
});

const TalkAsPlayerSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  message: z.string().min(1).max(512),
  type: z.enum(['talk', 'whisper', 'shout']).optional(),
  bubble_id: z.number().int().optional(),
});

const MovePlayerToRoomSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  room_id: z.number().int().positive(),
});

const GiveCreditsSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  amount: z.number().int().min(1).max(1_000_000),
});

const AlertPlayerSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  message: z.string().min(1).max(1024),
});

const SetPlayerMottoSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  motto: z.string().max(255),
});

const GetPlayerRoomSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
});

const GetOnlinePlayersSchema = z.object({
  api_key: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const GetRoomChatLogSchema = z.object({
  api_key: z.string().optional(),
  room_id: z.number().int().positive(),
  limit: z.number().int().min(1).max(500).optional(),
});

const HotelAlertSchema = z.object({
  api_key: z.string().optional(),
  message: z.string().min(1).max(1024),
  url: z.string().optional(),
});

const GiveBadgeSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  badge_code: z.string().min(1).max(12),
});

const GivePixelsSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  amount: z.number().int().min(1).max(10_000_000),
});

const GiveDiamondsSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  amount: z.number().int().min(1).max(10_000_000),
});

const KickPlayerSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
});

const MutePlayerSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  duration: z.number().int().min(1).max(86400),
});

const SetRankSchema = z.object({
  api_key: z.string().optional(),
  username: z.string().min(1),
  rank: z.number().int().min(1).max(9),
});

const DeployBotSchema = z.object({
  api_key: z.string().optional(),
  room_id: z.number().int().positive(),
  name: z.string().min(1).max(25),
  figure: z.string().optional(),
  figure_type: z.string().min(2).max(40).optional(),
  gender: z.enum(['M', 'F']).optional(),
  motto: z.string().max(100).optional(),
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  freeroam: z.boolean().optional(),
});

const TalkBotSchema = z.object({
  api_key: z.string().optional(),
  bot_id: z.number().int().positive(),
  message: z.string().min(1).max(512),
  type: z.enum(['talk', 'shout']).optional(),
});

const ListBotsSchema = z.object({
  api_key: z.string().optional(),
});

const DeleteBotSchema = z.object({
  api_key: z.string().optional(),
  bot_id: z.number().int().positive(),
});

const ValidateFigureSchema = z.object({
  api_key: z.string().optional(),
  figure: z.string().min(1).max(1024),
  gender: z.enum(['M', 'F']).optional(),
});

const RegisterFigureTypeSchema = z.object({
  api_key: z.string().optional(),
  figure_type: z.string().min(2).max(40),
  figure: z.string().min(1).max(1024),
  gender: z.enum(['M', 'F']).optional(),
  overwrite: z.boolean().optional(),
});

const ListFigureTypesSchema = z.object({
  api_key: z.string().optional(),
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
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
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
      required: ['username'],
    },
  },
  {
    name: 'generate_sso_ticket',
    description:
      'Generate a new single-use SSO login URL for an existing Habbo player. The player does not need to be online. Use this to let a player log in again.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the existing player' },
      },
      required: ['username'],
    },
  },
  {
    name: 'talk_as_player',
    description:
      'Make a Habbo player say something in their current room. The player must be online and in a room. Supports talk (normal), shout (caps bubble), and whisper modes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
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
      required: ['username', 'message'],
    },
  },
  {
    name: 'move_player_to_room',
    description:
      'Teleport a Habbo player to a specific room by room ID. The player must be online. Note: the underlying RCON command has a known Java bug where it always returns status 2 even on success — the command is still sent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player to move' },
        room_id: { type: 'number', description: 'Target room ID (positive integer)' },
      },
      required: ['username', 'room_id'],
    },
  },
  {
    name: 'give_credits',
    description:
      'Give Habbo credits to a player. The player must be online to see the update reflected immediately (the RCON command requires an active session). Amount between 1 and 1,000,000.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player to receive credits' },
        amount: { type: 'number', description: 'Number of credits to give (1–1,000,000)' },
      },
      required: ['username', 'amount'],
    },
  },
  {
    name: 'alert_player',
    description:
      'Send a pop-up alert message to a specific Habbo player. The player must be online to receive the alert. Note: the RCON alertuser command always returns status 2 due to a Java bug — the alert is still delivered.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player to alert' },
        message: { type: 'string', description: 'The alert message to display (max 1024 chars)' },
      },
      required: ['username', 'message'],
    },
  },
  {
    name: 'set_player_motto',
    description:
      "Update a Habbo player's motto (profile tagline). The player should be online for the change to take effect in their live session.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player' },
        motto: { type: 'string', description: 'New motto text (max 255 chars)' },
      },
      required: ['username', 'motto'],
    },
  },
  {
    name: 'get_player_room',
    description:
      "Get a player's current room context. Returns online status and current_room_id based on active room logs, with fallback to home_room.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player' },
      },
      required: ['username'],
    },
  },
  {
    name: 'get_online_players',
    description:
      'List all players currently online in the Habbo hotel. Returns id, username, look, gender, motto, credits, and rank for each player. Does not require a player to be online.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        limit: {
          type: 'number',
          description: 'Maximum number of players to return (1–200, default 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_room_chat_log',
    description:
      'Retrieve recent chat messages from a specific room, ordered oldest-first. Reads from the chatlogs_room database table. No player needs to be online.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        room_id: { type: 'number', description: 'Room ID to fetch chat log for' },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (1–500, default 100)',
        },
      },
      required: ['room_id'],
    },
  },
  {
    name: 'hotel_alert',
    description:
      'Broadcast a hotel-wide alert message to all players currently online. Optionally include a URL that players can click. No player needs to be specified.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        message: { type: 'string', description: 'The alert message to broadcast (max 1024 chars)' },
        url: {
          type: 'string',
          description: 'Optional URL to include with the alert (clickable link for players)',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'give_badge',
    description:
      'Give a badge to a Habbo player by badge code. Works whether the player is online or offline. If online, the badge is added to their inventory immediately.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player to receive the badge' },
        badge_code: { type: 'string', description: 'Badge code to give (e.g. "ADM", "ACH_Login1")' },
      },
      required: ['username', 'badge_code'],
    },
  },
  {
    name: 'give_pixels',
    description:
      'Give pixels (duckets) to a Habbo player. The player must be online for the update to take effect immediately.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player to receive pixels' },
        amount: { type: 'number', description: 'Number of pixels/duckets to give (1–10,000,000)' },
      },
      required: ['username', 'amount'],
    },
  },
  {
    name: 'give_diamonds',
    description:
      'Give diamonds (points/seasonal currency) to a Habbo player. The player must be online for the update to take effect immediately.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player to receive diamonds' },
        amount: { type: 'number', description: 'Number of diamonds to give (1–10,000,000)' },
      },
      required: ['username', 'amount'],
    },
  },
  {
    name: 'kick_player',
    description:
      'Disconnect and kick a player from the hotel. The player must be online. They can log back in immediately after.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player to kick' },
      },
      required: ['username'],
    },
  },
  {
    name: 'mute_player',
    description:
      'Mute a player so they cannot chat for a given duration. The player must be online.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player to mute' },
        duration: { type: 'number', description: 'Mute duration in seconds (1–86400, i.e. up to 24 hours)' },
      },
      required: ['username', 'duration'],
    },
  },
  {
    name: 'set_rank',
    description:
      'Set the rank/permission level of a Habbo player. Rank 1 is regular user, higher ranks grant more permissions (up to 9 for owner). The player does not need to be online.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        username: { type: 'string', description: 'Username of the player' },
        rank: { type: 'number', description: 'Rank level to assign (1–9)' },
      },
      required: ['username', 'rank'],
    },
  },
  {
    name: 'deploy_bot',
    description:
      'Create and deploy an NPC bot directly into a live room. The bot appears immediately as a visible avatar without needing a browser session. Returns the bot_id needed for talk_bot.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        room_id: { type: 'number', description: 'Room ID to place the bot in' },
        name: { type: 'string', description: 'Display name of the bot (max 25 chars)' },
        figure: {
          type: 'string',
          description: 'Custom Habbo figure/look string (optional, takes precedence over figure_type)',
        },
        figure_type: {
          type: 'string',
          description:
            'Figure type key. Supports builtins (default, citizen, agent) and custom keys created via register_figure_type.',
        },
        gender: { type: 'string', enum: ['M', 'F'], description: 'Gender of the bot (default M)' },
        motto: { type: 'string', description: 'Bot motto (optional, max 100 chars)' },
        x: { type: 'number', description: 'Tile X position in the room (default 0)' },
        y: { type: 'number', description: 'Tile Y position in the room (default 0)' },
        freeroam: {
          type: 'boolean',
          description: 'Whether the bot should roam around (default true). Set false to keep it in place.',
        },
      },
      required: ['room_id', 'name'],
    },
  },
  {
    name: 'validate_figure',
    description:
      'Validate and normalize a Habbo figure/look string against live figuredata.xml rules used by the emulator. Returns normalized_figure and any adjustments.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        figure: { type: 'string', description: 'Figure/look string to validate' },
        gender: {
          type: 'string',
          enum: ['M', 'F'],
          description: 'Target gender rules to validate against (default M)',
        },
      },
      required: ['figure'],
    },
  },
  {
    name: 'register_figure_type',
    description:
      'Create or update a custom figure_type key by validating and normalizing a figure string first. The saved key can then be used in deploy_bot.figure_type.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        figure_type: {
          type: 'string',
          description: 'Custom key to save (2-40 chars, letters/numbers/_/-)',
        },
        figure: { type: 'string', description: 'Figure/look string to validate and store' },
        gender: {
          type: 'string',
          enum: ['M', 'F'],
          description: 'Validation gender rules (default M)',
        },
        overwrite: {
          type: 'boolean',
          description: 'Set true to overwrite an existing custom figure_type',
        },
      },
      required: ['figure_type', 'figure'],
    },
  },
  {
    name: 'list_figure_types',
    description:
      'List all available figure_type keys (builtin + custom) and their resolved figure strings.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
      },
      required: [],
    },
  },
  {
    name: 'talk_bot',
    description:
      'Make an NPC bot say something in the room it is currently deployed in. The bot must be in a loaded room (someone must be in the room). Supports talk and shout.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        bot_id: { type: 'number', description: 'Bot ID returned by deploy_bot' },
        message: { type: 'string', description: 'Message to say (max 512 chars)' },
        type: { type: 'string', enum: ['talk', 'shout'], description: 'Speech type: talk (default) or shout' },
      },
      required: ['bot_id', 'message'],
    },
  },
  {
    name: 'list_bots',
    description: 'List all NPC bots in the hotel, including their room placement and position.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
      },
      required: [],
    },
  },
  {
    name: 'delete_bot',
    description: 'Remove an NPC bot from the hotel by bot ID. The bot is deleted from the database.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_key: { type: 'string', description: 'MCP API key (optional — falls back to MCP_API_KEY env var)' },
        bot_id: { type: 'number', description: 'Bot ID to delete' },
      },
      required: ['bot_id'],
    },
  },
] as const;

// ─── Server factory ───────────────────────────────────────────────────────────

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function toErrorResponse(errorMessage: string): ToolResponse {
  return {
    content: [ { type: 'text', text: `Error: ${errorMessage}` } ],
    isError: true,
  };
}

function createMcpServer() {
  const server = new Server(
    { name: 'habbo-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // ── List tools ──────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  const callTool = async (name: string, args: unknown, channel: string): Promise<ToolResponse> => {
    const startedAt = Date.now();
    let principal = null;

    try {
      principal = await resolvePrincipal(extractApiToken(args), channel);
      assertToolAllowed(principal, name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const response = toErrorResponse(message);
      try {
        await logToolCall({
          principal,
          toolName: name,
          args,
          success: false,
          errorCode: 'AUTH_ERROR',
          durationMs: Date.now() - startedAt,
        });
      } catch {
        // Don't break response flow on audit insert failure.
      }
      return response;
    }

    const result = await (async (): Promise<ToolResponse> => {
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

        // ── get_player_room ─────────────────────────────────────────────────
        case 'get_player_room': {
          const input = GetPlayerRoomSchema.parse(args);
          validateApiKey(input.api_key);
          const roomInfo = await getPlayerRoom(input.username);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(roomInfo, null, 2),
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
            figure_type: input.figure_type,
            gender: input.gender,
            motto: input.motto,
            x: input.x,
            y: input.y,
            freeroam: input.freeroam,
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

        // ── validate_figure ──────────────────────────────────────────────────
        case 'validate_figure': {
          const input = ValidateFigureSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await validateFigure(input.figure, input.gender);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── register_figure_type ─────────────────────────────────────────────
        case 'register_figure_type': {
          const input = RegisterFigureTypeSchema.parse(args);
          validateApiKey(input.api_key);
          const result = await registerFigureType({
            figure_type: input.figure_type,
            figure: input.figure,
            gender: input.gender,
            overwrite: input.overwrite,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        // ── list_figure_types ────────────────────────────────────────────────
        case 'list_figure_types': {
          const input = ListFigureTypesSchema.parse(args);
          validateApiKey(input.api_key);
          const types = await listFigureTypes();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ count: types.length, types }, null, 2) }],
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
    })();

    try {
      await markTokenUsed(principal.tokenId);
      await logToolCall({
        principal,
        toolName: name,
        args,
        success: !result.isError,
        errorCode: result.isError ? 'TOOL_ERROR' : null,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      // Don't break user-facing result on audit failure.
    }

    return result;
  };

  // ── Call tool ───────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ToolResponse> => {
    const { name, arguments: args } = request.params;
    return callTool(name, args, 'stdio');
  });

  return {
    server,
    tools: TOOLS,
    callTool,
  };
}

export async function startStdioServer(): Promise<void> {
  const { server } = createMcpServer();
  // ── Connect transport and run ───────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('habbo-mcp server running on stdio');
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});

      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(text.trim().length ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.end(JSON.stringify(payload));
}

export async function startHttpServer(): Promise<void> {
  const cfg = getConfig();
  const { tools, callTool } = createMcpServer();

  const httpServer = createServer(async (req, res) => {
    const method = (req.method || 'GET').toUpperCase();
    const url = req.url || '/';

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.end();
      return;
    }

    if ((method === 'GET') && (url === '/health')) {
      json(res, 200, { ok: true });
      return;
    }

    if ((method === 'GET') && (url === '/.well-known/mcp-server.json')) {
      json(res, 200, {
        name: 'habbo-mcp',
        version: '1.0.0',
        endpoint: '/mcp',
        transport: 'http-json',
      });
      return;
    }

    if ((method !== 'POST') || (url !== '/mcp')) {
      json(res, 404, { error: 'Not found' });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const authHeader = String(req.headers.authorization || '').trim();
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const suppliedToken = extractApiToken(body?.params?.arguments) || bearerToken;

      const methodName = String(body?.method || '');
      const requestId = body?.id ?? null;

      if (methodName === 'initialize') {
        await resolvePrincipal(suppliedToken, 'http');
        json(res, 200, {
          jsonrpc: '2.0',
          id: requestId,
          result: {
            protocolVersion: String(body?.params?.protocolVersion || '2024-11-05'),
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'habbo-mcp',
              version: '1.0.0',
            },
          },
        });
        return;
      }

      if (methodName === 'notifications/initialized') {
        // JSON-RPC notifications should not return a body.
        res.statusCode = 204;
        res.end();
        return;
      }

      if (methodName === 'ping') {
        await resolvePrincipal(suppliedToken, 'http');
        json(res, 200, {
          jsonrpc: '2.0',
          id: requestId,
          result: {},
        });
        return;
      }

      if (methodName === 'tools/list') {
        const principal = await resolvePrincipal(suppliedToken, 'http');
        const visibleTools = tools.filter((tool) => canUseTool(principal, tool.name));
        json(res, 200, { jsonrpc: '2.0', id: requestId, result: { tools: visibleTools } });
        return;
      }

      if (methodName !== 'tools/call') {
        json(res, 400, {
          jsonrpc: '2.0',
          id: requestId,
          error: { code: -32601, message: `Unsupported method '${methodName}'` },
        });
        return;
      }

      const toolName = String(body?.params?.name || '');
      const args = body?.params?.arguments || {};
      const payload = { ...(args || {}) } as Record<string, unknown>;
      if (suppliedToken) payload.api_key = suppliedToken;
      const result = await callTool(toolName, payload, 'http');

      json(res, 200, {
        jsonrpc: '2.0',
        id: requestId,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 400, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Invalid request: ${message}`,
        },
      });
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(cfg.http.port, cfg.http.host, () => resolve());
  });
  console.error(`habbo-mcp server running on http://${cfg.http.host}:${cfg.http.port}/mcp`);
}
