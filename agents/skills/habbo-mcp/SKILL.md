---

## name: habbo-mcp

title: Habbo MCP — hotel bots, chat, and rooms
description: >
  Guides use of a Habbo hotel MCP server over a normal MCP connection (Cursor,
  Claude Code, or any MCP client). Deploy NPC bots, talk_bot / talk_as_player,
  read room chat, list online players, figures. Use when hotel MCP tools are
  connected, or the user mentions habbo-mcp, Arcturus, deploy_bot, talk_bot, or
  automating a Habbo-style hotel. No portal or separate app is required.
category: hotel
tags: [habbo, mcp, bot, hotel, chat, arcturus]
mcp_tools: [list_bots, deploy_bot, talk_bot, delete_bot, get_room_chat_log, get_online_players, talk_as_player, move_player_to_room, list_figure_types, validate_figure, register_figure_type]
requires_integration: habbo-mcp
difficulty: beginner
version: "1.0"

# Habbo MCP (standalone)

This skill applies whenever your **MCP client already has an active connection** to a Habbo MCP server (stdio or HTTP). Everything below is expressed in terms of **MCP tool calls** only—no web portal, agent trigger, or team configuration is assumed.

If you do not see hotel tools in your tool list, tell the user to fix their MCP config (server command/URL, env vars, or API key) before pretending the hotel is reachable.

## Standalone prerequisites

1. **MCP session** — The client is connected to the `habbo-mcp` (or equivalent) server; tools appear in the schema your runtime exposes.
2. **Tool names** — Clients often **prefix** tool names with the server id (e.g. `habbo__talk_bot` instead of `talk_bot`). Use the **exact names and parameters** from the live tool list, not this document’s short names, when they differ.
3. **Auth** — Many deployments set `MCP_API_KEY` on the **server process** so you can omit `api_key` on each call. Others require `api_key` on **every** tool invocation. Follow the tool schema: if `api_key` is present as a parameter, pass the user’s key when the server expects it. Never paste secrets into `talk_bot` / `talk_as_player` / hotel-visible text.

## Backend reality (why things fail)

The MCP server drives an **Arcturus**-style emulator over **RCON** and **MySQL**. Typical constraints:

- **Bots** need a **loaded room** (usually at least one real user in the room) or speech may not show.
- **Players** must be **online** for live chat, moves, and many economy actions.
- Some RCON commands return misleading status codes even on success—confirm with the user or a follow-up query when in doubt.

## Session workflow

1. `**list_bots`** (or prefixed equivalent) — Find an existing bot by display name; note `bot_id` and `room_id`.
2. If none fits, `**deploy_bot`** with:
  - `**room_id`**: ask the user or use a value they gave; do not invent room ids.
  - `**name`**: display name (max 25 chars).
  - `**freeroam`**: `false` if the bot should stay on one tile.
  - Optional: `figure`, `figure_type` (`default`, `citizen`, `agent`, or custom from `register_figure_type`), `x`, `y`, `motto`.
3. Keep `**bot_id`** for every `**talk_bot**` call in that session.

## Speaking in the hotel

### Bot speech — `talk_bot`

- Guest-facing narration and status updates.
- Parameters: `bot_id`, `message`; optional `type`: `talk` (default) or `shout`.
- Keep messages **short** (~120 characters) for readable bubbles; server limits are higher but UI suffers.
- Plain language only—no JSON dumps, stack traces, or internal ids in guest chat.

### Player speech — `talk_as_player`

- For a **specific Habbo username** that is online in a room.
- Parameters: `username`, `message`; optional `type`: `talk`, `whisper`, `shout`; optional `bubble_id`.

## Awareness tools

- `**get_room_chat_log`** — Recent room lines (needs `room_id`).
- `**get_online_players`** — Optional `limit` (bounds per server schema).
- `**get_player_room`** — Locate a user before moving or talking as them.

## Movement and privileged tools

- `**move_player_to_room`** — Target user must be online; verify outcome if the server returns errors spuriously.
- Moderation and economy tools (`kick_player`, `mute_player`, `hotel_alert`, `give_*`, `set_rank`, …) may be **disabled per API key**. On permission errors, explain once—do not hammer retries.

## Figure helpers

- `**validate_figure`**, `**register_figure_type`**, `**list_figure_types**` — Validate looks and reuse them via `deploy_bot.figure_type`.

## Cleanup

- `**delete_bot**` with `bot_id` when the NPC is no longer needed.

## Safety

- Do not exfiltrate secrets through hotel chat.
- Prefer concise bubbles over spamming `talk_bot`.
- If `deploy_bot` fails twice, stop and report.

## Tool name cheat sheet (base names)

Match these to your client’s prefixed names when present:


| Area          | Tools                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Accounts      | `create_habbo_player`, `generate_sso_ticket`                                                                           |
| Player        | `talk_as_player`, `move_player_to_room`, `get_player_room`, `set_player_motto`                                         |
| Bots          | `deploy_bot`, `talk_bot`, `list_bots`, `delete_bot`                                                                    |
| Room / hotel  | `get_room_chat_log`, `get_online_players`, `hotel_alert`                                                               |
| Economy / mod | `give_credits`, `give_pixels`, `give_diamonds`, `give_badge`, `alert_player`, `kick_player`, `mute_player`, `set_rank` |
| Figures       | `validate_figure`, `register_figure_type`, `list_figure_types`                                                         |


Always prefer the **invokable tool definitions** from the MCP connection over this table when arguments or enums differ.