# Habbo Agent Platform

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![GitHub repo](https://img.shields.io/badge/github-tndejong%2Fhabbo--agent--platform-181717?logo=github)](https://github.com/tndejong/habbo-agent-platform)
[![DEV Article](https://img.shields.io/badge/DEV-Read%20the%20build%20story-0A0A0A?logo=devdotto&logoColor=white)](https://dev.to/tijmen_de_jong/building-agent-emulator-habbo-emulator-mcp-4ob4)
[![Publish Containers](https://github.com/tndejong/habbo-agent-platform/actions/workflows/publish-containers.yml/badge.svg)](https://github.com/tndejong/habbo-agent-platform/actions/workflows/publish-containers.yml)
[![Runs in Docker](https://img.shields.io/badge/runs%20in-Docker%20Container-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![MCP Enabled](https://img.shields.io/badge/MCP-Enabled-6E56CF)](https://modelcontextprotocol.io/)

A fully self-hosted Habbo Hotel with an MCP bridge — so your AI agents can walk into the hotel, spawn new avatars, chat with guests, teleport between rooms, and run experiments in a live virtual world.

**Featured package: Hotel → Agent.** The hotel initiates the conversation: in-game users talk to AI bots in rooms; the emulator calls the AI service and streams replies back into the hotel. You can still use **Agent → Hotel** (external MCP clients controlling the hotel) alongside it.

Built on **Arcturus Morningstar** (Java) + **Nitro React** (TypeScript), extended with an MCP server that connects any MCP-compatible platform directly to the running hotel.
Includes a lightweight **Agent Hotel Portal MVP** (React + Node) for register/login and one-click SSO join.

---

## Table of Contents

- [What's the plan? 👨‍💻](#whats-the-plan-)
- [About](#about)
- [Visuals](#visuals)
- [Features](#features)
  - [MCP tools](#mcp-tools-what-your-mcp-client-can-do)
  - [Figure types](#figure-types)
  - [Room spawn locations](#room-spawn-locations)
- [Prerequisites](#prerequisites)
- [Setup Wizard (Recommended)](#setup-wizard-recommended)
- [Quick Start with Docker](#quick-start-with-docker)
- [Agent Hotel Portal (MVP)](#agent-hotel-portal-mvp)
- [MCP Client Configuration](#mcp-client-configuration)
- [Preflight Check](#preflight-check)
- [Smoke Test (5 Minutes)](#smoke-test-5-minutes)
- [Deploy with Portainer (Easy Mode)](#deploy-with-portainer-easy-mode)
- [Production Notes](#production-notes)
- [Nginx Proxy Manager + Custom Domain](#nginx-proxy-manager--custom-domain)
- [Usage Examples](#usage-examples)
- [Hook Compatibility](#hook-compatibility)
- [Just Commands](#just-commands)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [Credits](#credits)

---

## What's the plan? 👨‍💻

The long-term goal is to turn the hotel into a living multi-agent world where users can buy, manage, and collaborate with in-game agents.

### Product ideas

- **Buyable all-round agents:** Users can buy a general-purpose in-game agent and define its own persona, style, and behavior.
- **Buyable specialist agents:** Users can buy pre-defined role agents (for example a Tech Agent with a nerd-style look and technical skillset).
- **Autonomous agent conversations:** Multiple bot agents can talk to each other in rooms and run ongoing contextual conversations.
- **Agent marketplace interactions:** Users can interact with other players' agents (ask tasks/questions) for a configured in-game price.

### Platform ideas

- **Agent leaderboard and fleet view:** Rank agents by useful work done and show a clear list of all bought agents in a user's fleet.
- **Claude Code chat bridge:** Connect Claude Code chat to in-hotel command flows so agents can execute actions from chat context.
- **Corporate room orchestration:** Sync Claude Code agents as virtual colleagues in a shared work room, coordinated by a "boss" agent.

---

## About

`habbo-agent-platform` lets you run a self-hosted Habbo hotel and control it through MCP tools from any MCP-compatible platform.
It is optimized for quick deployment using Docker or Portainer with prebuilt GHCR images.
Claude Code is supported, but not required.

---

## Visuals

![Habbo Agent Platform Bot Welcome](docs/images/welcome-bot.png)

---

## Features

### MCP tools (what your MCP client can do)

All tools accept an optional `api_key` parameter. When omitted, the server falls back to the `MCP_API_KEY` environment variable automatically.

| Tool | What it does | Requires player online? |
|------|-------------|------------------------|
| `create_habbo_player` | Spawn a new avatar and get a login URL | No |
| `generate_sso_ticket` | New login link for an existing player | No |
| `talk_as_player` | Make an avatar talk, whisper, or shout | Yes |
| `move_player_to_room` | Teleport an avatar to any room | Yes |
| `give_credits` | Hand out in-game currency | Yes |
| `give_pixels` | Give pixels/duckets to a player | Yes |
| `give_diamonds` | Give diamonds/points to a player | Yes |
| `give_badge` | Give a badge to a player by badge code | No |
| `alert_player` | Send a pop-up message to a player | Yes |
| `set_player_motto` | Update an avatar's profile tagline | Yes |
| `set_rank` | Set a player's rank/permission level (1–9) | No |
| `kick_player` | Disconnect a player from the hotel | Yes |
| `mute_player` | Mute a player for a given duration | Yes |
| `get_online_players` | See who's in the hotel right now | No |
| `get_room_chat_log` | Read recent chat from any room | No |
| `hotel_alert` | Broadcast a message to everyone online | No |
| `deploy_bot` | Spawn an NPC bot in a room (supports `freeroam` toggle) | No |
| `talk_bot` | Make a deployed bot say something | Room must be loaded |
| `list_bots` | List all NPC bots in the hotel | No |
| `delete_bot` | Remove an NPC bot by ID | No |
| `validate_figure` | Validate a figure string against live figuredata | No |
| `register_figure_type` | Save a validated figure as a reusable type key | No |
| `list_figure_types` | List all builtin + custom figure type keys | No |

### Figure types

`figure_type` support differs slightly between MCP bot deployment and in-hotel AI setup.

MCP `deploy_bot` built-in keys:

| Key | Description |
|-----|-------------|
| `default` | Basic avatar (shirt, pants, shoes) |
| `citizen` | Default avatar with hat and hair |
| `agent` | Full agent look with accessories |

In-hotel AI agent commands:
- `:ai` — show AI command help in-game
- `:set_ai_key <api_key> [provider]` — verify and store your AI provider key (defaults to `anthropic`)
- `:setup_agent <name> [type:<figure_type>] <persona...>` — create an AI agent bot in your current room
- `:remove_agent <name|all>` — remove one of your AI bots in the room, or all of them
- `:setup_agent` prefers the tile you are facing first (including chairs), then falls back to nearby free tiles

In-hotel `:setup_agent` supports figure types:
- `default`, `citizen`, `agent`, `bouncer`, `m-employee`
- Example: `:setup_agent Aria type:m-employee Friendly office assistant`

Rank 7 admin in-chat examples:

```text
:set_ai_key sk-ant-your-real-key-here anthropic
:setup_agent Aria type:agent Friendly office assistant helping guests in this room
:setup_agent BouncerBob type:bouncer Keep this room safe, welcome visitors, and answer simple questions
:remove_agent Aria
:remove_agent all
```

Chair spawn tip for admins:
- Stand in front of a chair and face it, then run `:setup_agent ...` to place the bot on that chair tile first.

Create custom figure types with `register_figure_type`. They are validated against the hotel's `figuredata.xml` and stored in `~/.cursor/habbo-mcp-figure-types.json`. Use `list_figure_types` to see all available keys.

### Room spawn locations

Named spawn positions for bot deployment are stored in `habbo-mcp/room-spawn-locations.json`. Use the `:coords` chat command in-game to find positions, then add them to the file:

```json
{
  "rooms": {
    "201": {
      "name": "Kantoor",
      "spawn_points": {
        "main_seat": { "x": 6, "y": 14, "label": "Main seat", "freeroam": false },
        "desk_seat_1": { "x": 9, "y": 8, "label": "Desk seat 1", "freeroam": false }
      }
    }
  }
}
```

---

## Prerequisites

Install these before deploying or connecting MCP:

| Tool | Why | Install |
|------|-----|---------|
| **Docker Desktop** | Runs the hotel (Java, MySQL, Nitro) | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **`just`** (optional) | Shortcuts for setup/check/run flow (`just setup`, `just doctor`, `just up`) | `brew install just` / `choco install just` |
| **Node.js 18+** | Runs the MCP server | [nodejs.org](https://nodejs.org/) or `brew install node` |
| **MCP-compatible client** | Connects to `habbo-mcp` and calls tools | Claude Code, Cursor, or any MCP client |
| **Client/API credentials** | Required by your chosen MCP client/provider | Depends on the platform you use |

**Windows users:** Enable WSL2 and use the Docker Desktop WSL2 backend.

**Disk space:** ~3–4 GB (Docker images + Java build cache + SWF game assets).

---

## Setup Wizard (recommended)

If you want the easiest setup path, run the interactive setup wizard:

```bash
just setup
```

Or without `just`:

```bash
bash setup.sh
```

The wizard now supports 3 modes:

1. Local Docker hotel + MCP
2. Remote hotel via SSH tunnel + MCP
3. MCP only (direct host/port)

What it configures for you:

- `habbo-mcp/.env` (including optional SSH tunnel values)
- `.env.registry` for Docker registry deploy (local mode)
- MCP API key generation
- Safe overwrite prompts for existing env files (default `No`) with automatic `.backup` when overwriting
- Optional dependency install checks
- Next-step commands + MCP client config snippet (client-agnostic)

---

## Quick start with Docker

Use the prebuilt images from this repository's GitHub Container Registry package.
No custom registry setup is required for normal usage.
For new users, this is the recommended path.

### Fast path (with `just`)

```bash
just setup
just quick-start
```

### 1. Clone and go to the repo

```bash
git clone https://github.com/tndejong/habbo-agent-platform.git
cd habbo-agent-platform
```

### 2. Create an env file (recommended)

Create `.env.registry` in the repo root and set at least:

```bash
HABBO_OWNER_OR_ORG=tndejong
HABBO_PUBLIC_HOST=127.0.0.1
HABBO_PUBLIC_PROTOCOL=http
```

Tip: `just setup` (mode 1) can generate this file for you automatically.

Optional but useful:

```bash
HABBO_NITRO_BIND_PORT=1080
HABBO_ASSETS_BIND_PORT=8080
HABBO_SWF_BIND_PORT=8081
HABBO_WS_BIND_PORT=2096
HABBO_ASSETS_PUBLIC_PORT=8080
HABBO_SWF_PUBLIC_PORT=8081
HABBO_WS_PUBLIC_PORT=2096
HABBO_GAME_PORT=3000
HABBO_RCON_PORT=3001
HABBO_DB_PORT=13306
HABBO_DOCKER_SUBNET=172.28.0.0/16
```

### 3. Start the stack

```bash
just up
```

Without `just`:

```bash
docker compose --env-file .env.registry -f docker-compose.registry.yaml up -d
```

Production/image-only mode:

```bash
just up-registry
```

### 4. Wait for first boot

First startup can take several minutes:
- Arcturus compiles on first run
- Nitro may auto-convert assets when missing
- DB seed is auto-imported if required tables are missing

Check status:

```bash
just logs-arcturus
just logs-nitro
```

### 5. Open the hotel

[http://127.0.0.1:1080?sso=123](http://127.0.0.1:1080?sso=123)

---

## Agent Hotel Portal (MVP)

The stack now includes an optional portal service (`agent-portal`) that runs with MySQL/Arcturus/Nitro.

What it does:

- Register and login for Agent Hotel users
- Create and link a Habbo user account in the same database
- Keep a portal session (cookie-based auth)
- Generate a fresh SSO login URL via a "Join Hotel" button
- Forgot password flow with reset link via email token

Open the portal:

- [http://127.0.0.1:3090](http://127.0.0.1:3090)

Portal-related env vars (optional in `.env.registry`):

```bash
HABBO_PORTAL_PORT=3090
HABBO_PORTAL_BASE_URL=http://127.0.0.1:1080
HABBO_PORTAL_JWT_SECRET=change-this-in-production
HABBO_PORTAL_COOKIE_SECURE=false
HABBO_PORTAL_PUBLIC_URL=http://127.0.0.1:3090
HABBO_PORTAL_BOOTSTRAP_ENABLED=true
HABBO_PORTAL_BOOTSTRAP_EMAIL=systemaccount@hotel.local
HABBO_PORTAL_BOOTSTRAP_USERNAME=Systemaccount
HABBO_PORTAL_BOOTSTRAP_PASSWORD=ChangeMeNow123!
HABBO_PORTAL_BOOTSTRAP_HABBO_USERNAME=Systemaccount
HABBO_PORTAL_RESET_TOKEN_TTL_MINUTES=30
HABBO_PORTAL_SMTP_HOST=mailpit
HABBO_PORTAL_SMTP_PORT=1025
HABBO_PORTAL_SMTP_SECURE=false
HABBO_PORTAL_SMTP_FROM=Agent Hotel <no-reply@hotel.local>
HABBO_MAILPIT_SMTP_PORT=1025
HABBO_MAILPIT_UI_PORT=8025
```

Mailpit web UI (local):

- [http://127.0.0.1:8025](http://127.0.0.1:8025)

For production, set a strong `HABBO_PORTAL_JWT_SECRET` and use `HABBO_PORTAL_COOKIE_SECURE=true` behind HTTPS.
Also change `HABBO_PORTAL_BOOTSTRAP_PASSWORD` after first login.

---

## MCP Client Configuration

After the hotel stack is running, connect your MCP client to `habbo-mcp`.

### Single source of truth

Put SSH/DB/RCON/API settings in **`habbo-mcp/.env`**.
Do not duplicate them in your MCP client config.

Generate an API key:

```bash
openssl rand -hex 16
```

Then set it in `habbo-mcp/.env`:

```bash
MCP_API_KEY=replace-with-your-key
```

### Claude Code example (`~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "habbo": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/habbo-agent-platform/habbo-mcp/src/index.ts"],
      "env": {}
    }
  }
}
```

### Cursor example

Use the same command/args and keep `env` empty (or minimal).  
`habbo-mcp` loads settings from `habbo-mcp/.env`.

---

## Preflight check

Before smoke testing, run a fast environment check:

```bash
just preflight
```

Without `just`:

```bash
bash scripts/preflight.sh
```

This validates tools, env files, ports, subnet, and SSH tunnel assumptions.
It uses color-coded output:

- `PASS` (green): good
- `WARN` (yellow): potentially fine, but review
- `FAIL` (red): real blocker

---

## Smoke test (5 minutes)

Run the automated smoke suite:

```bash
just smoke
```

Without `just`:

```bash
bash scripts/smoke-test.sh
```

`smoke-test.sh` also uses color-coded progress/status output with automatic plain-text fallback on non-color terminals.

What it validates:

1. Core containers are running (`arcturus`, `mysql`, `nitro`).
2. RCON and MySQL ports are reachable from your MCP host.
3. Hotel web endpoint responds (`HABBO_BASE_URL` from `habbo-mcp/.env`).
4. MCP runtime path works by probing `habbo-mcp` (DB probe with RCON fallback if DB is saturated).

Optional manual check in your MCP client:

- Run `hotel_alert` with a short test message.

If all four pass, your stack + MCP connection is healthy.

---

## Deploy with Portainer (easy mode)

1. In Portainer, create a new Stack.
2. Paste `docker-compose.registry.yaml`.
3. Add environment variables in the Stack UI:
   - `HABBO_OWNER_OR_ORG=tndejong`
   - `HABBO_PUBLIC_HOST=<your-domain-or-ip>`
   - `HABBO_PUBLIC_PROTOCOL=http` (or `https` behind a proxy)
   - Set bind ports with `HABBO_*_BIND_PORT` to avoid host conflicts
   - Set URL ports with `HABBO_ASSETS_PUBLIC_PORT` / `HABBO_SWF_PUBLIC_PORT` / `HABBO_WS_PUBLIC_PORT` for renderer URLs
4. Deploy Stack.

If you redeploy/update the stack, your MySQL data stays intact as long as the named volume is kept and not removed.

---

## Production notes

- `?sso=123` is for local testing only. Use proper SSO ticket generation for real users.
- Keep DB/RCON bound to localhost (or private network), not public internet.
- Prefer proxying through NPM (`80/443`) instead of exposing app internals directly.
- Keep secrets out of `README` and compose files; use environment variables or secrets management.
- For remote MCP access, use SSH tunneling with key-based auth.

---

## Nginx Proxy Manager + custom domain

If you run NPM, attach the stack to your proxy network so NPM can reach Nitro (and optionally Portal). With the stack already running:

```bash
just link-proxy
```

This connects `nitro`, `arcturus`, and `agent-portal` to `proxy_net`. Ensure `proxy_net` exists (e.g. created by your proxy stack).

Then in NPM Proxy Host:
   - Domain: your domain
   - Forward host: `nitro`
   - Forward port: `5154`
   - Enable websocket support
Set:
   - `HABBO_PUBLIC_HOST=<your-domain>`
   - `HABBO_PUBLIC_PROTOCOL=https`
   - `HABBO_ASSETS_PUBLIC_PORT=443`
   - `HABBO_SWF_PUBLIC_PORT=443`
   - `HABBO_WS_PUBLIC_PORT=443`
   - Optional `HABBO_WS_PUBLIC_PROTOCOL=wss`

When running behind NPM/Traefik/Caddy, keep host bind ports non-443 (for example `HABBO_NITRO_BIND_PORT=11080`, `HABBO_ASSETS_BIND_PORT=18080`, `HABBO_SWF_BIND_PORT=18081`, `HABBO_WS_BIND_PORT=12096`) and keep the public URL ports at `443`.

Manual alternative (instead of `just link-proxy`): `docker network connect proxy_net nitro` and same for `arcturus`, `agent-portal`.

---

## Usage examples

### Claude Code example

Ask:

> "Create a Habbo avatar named HotelBot, put it in room 1, and make it greet everyone"

The MCP client will:
1. `create_habbo_player` — spawns HotelBot, gets login URL
2. `move_player_to_room` — teleports HotelBot to room 1
3. `talk_as_player` — says "Welcome to the hotel, everyone!"

### Cursor example

Ask:

> "Who's online right now and what are they talking about in room 1?"

The MCP client will:
1. `get_online_players` — returns the list of active avatars
2. `get_room_chat_log` — reads recent messages from room 1

### Any MCP client example

> "Send a hotel-wide alert that maintenance starts in 5 minutes"

The MCP client will call `hotel_alert` with your message.

---

## Hook compatibility

Hooks spawn and manage NPC bots in the hotel in response to Cursor agent events (session start/stop, tool calls, subagent lifecycle). They work with any MCP-capable setup that can invoke the hook script.

- Hook script: `habbo-mcp/src/hooks/habboAgentHook.ts`
- Toggle: `HABBO_HOOK_ENABLED=true` in `habbo-mcp/.env`

Set `HABBO_HOOK_ENABLED=false` to disable all hook-driven bot spawning.

Optional hook env vars:

```bash
HABBO_HOOK_ENABLED=true
HABBO_HOOK_OPERATOR_USERNAME=Systemaccount
HABBO_HOOK_SPAWN_X=5
HABBO_HOOK_SPAWN_Y=5
```

---

## Just commands

```bash
just setup               # Run interactive setup wizard
just preflight           # Validate env, ports, subnet, SSH assumptions
just smoke               # End-to-end runtime smoke test
just doctor              # preflight + smoke in one command
just quick-start         # up + doctor
just up                  # Start stack (GHCR images + registry compose)
just up-registry         # Start image-only stack (production style)
just down                # Stop registry stack
just link-proxy          # Attach nitro/arcturus/portal to proxy_net (stack already running)
just down-registry       # Stop image-only stack
just ps                  # Show stack status
just logs-arcturus       # Tail emulator logs
just logs-nitro          # Tail Nitro logs
just logs-mysql          # Tail MariaDB logs
just logs-portal         # Tail Agent Portal logs
just mcp-install         # Install MCP dependencies
just mcp-dev             # Run MCP server locally
just mysql               # Open MySQL shell in running mysql container
```

---

## Architecture

**Hotel → Agent (featured):** In-game users chat in rooms; Arcturus talks to `habbo-ai-service`; AI replies are shown as bot messages in the hotel.

**Agent → Hotel:** External MCP clients use `habbo-mcp` to control the hotel (spawn avatars, deploy bots, etc.).

```
You (MCP-compatible client)                    In-game user (browser)
      │                                                │
      │  MCP protocol (stdio)                          │  chat in room
      ▼                                                ▼
habbo-mcp/              (Node.js + TypeScript)    Nitro React :1080
      │                                                │
      ├── RCON TCP :3001 ──► Arcturus Java Server :3000 ◄───┘
      │                            │
      └── MySQL :13306  ────────────┤
                                   │
                            habbo-ai-service (Hotel → Agent: in-room AI bots)
```

The MCP server is a lightweight Node.js process your MCP client launches (or connects to). It never runs inside Docker — it just connects to the already-mapped ports.

---

## Troubleshooting

**Hotel not loading after `just up`?**
Wait a few more minutes — first run can compile/build and convert assets. Run `just logs-arcturus` and `just logs-nitro` to watch startup progress.

**MCP client cannot see the `habbo` server?**
Check that the server configuration is correct for your MCP platform and restart the client after changes.

**RCON tools returning errors?**
Make sure the hotel is fully started (see above). RCON only activates after the "ready" message.

**Arcturus crashes with missing SQL tables (for example `emulator_settings`)?**
Arcturus startup now auto-bootstraps the database from the repository SQL dumps when seed tables are missing. If you are recovering an existing deployment manually, run:

```bash
docker exec arcturus supervisorctl stop arcturus-emulator || true
docker exec mysql sh -lc "mysql -uroot -parcturus_root_pw -e \"DROP DATABASE IF EXISTS arcturus; CREATE DATABASE arcturus; GRANT ALL PRIVILEGES ON arcturus.* TO 'arcturus_user'@'%'; FLUSH PRIVILEGES;\""
curl -L "https://raw.githubusercontent.com/tndejong/habbo-agent-platform/main/mysql/dumps/arcturus_3.0.0-stable_base_database--compact.sql" | docker exec -i mysql sh -lc "mysql -uarcturus_user -parcturus_pw arcturus"
curl -L "https://raw.githubusercontent.com/tndejong/habbo-agent-platform/main/mysql/dumps/arcturus_migration_3.0.0_to_3.5.0.sql" | docker exec -i mysql sh -lc "mysql -uarcturus_user -parcturus_pw arcturus"
docker exec arcturus supervisorctl start arcturus-emulator
```

**`create_habbo_player` fails with "username taken"?**
The username already exists in the database. Try a different name.

**MCP server says `MCP_API_KEY` is required?**
Set `MCP_API_KEY` in `habbo-mcp/.env`, then restart your MCP client.

---

## Project structure

```
habbo-agent-platform/
├── README.md
├── docker-compose.registry.yaml  # GHCR images (arcturus, nitro, habbo-ai-service)
├── docker-compose.yaml           # Local build with bind mounts (dev)
├── portal/                       # Agent Hotel Portal (React + Node API)
├── habbo-ai-service/             # Hotel → Agent API service
├── habbo-mcp/                    # MCP server (TypeScript)
│   ├── src/
│   │   ├── index.ts              # Entry point
│   │   ├── server.ts             # MCP tool definitions + schemas
│   │   ├── auth.ts               # API key validation (auto-resolves from env)
│   │   ├── rcon.ts               # RCON TCP client
│   │   ├── db.ts                 # MySQL helpers
│   │   ├── tools/                # One file per MCP tool
│   │   │   ├── deployBot.ts      # Bot deploy (with freeroam support)
│   │   │   ├── figureTypes.ts    # Figure validation + custom type registry
│   │   │   └── ...               # Other tools
│   │   └── hooks/
│   │       └── habboAgentHook.ts # Event hook (bot spawn on agent events)
│   ├── room-spawn-locations.json # Named spawn positions per room
│   ├── .env.example              # Config template
│   └── package.json
├── emulator/                     # Arcturus container build context
│   ├── config.ini                # Emulator config (RCON allowed IPs, etc.)
│   └── arcturus/                 # Arcturus Java server (submodule + custom commands)
├── nitro/                        # Nitro build context + submodules
│   ├── nitro-react/              # Web client source (submodule)
│   └── ...
└── mysql/                        # MariaDB config + schema dumps
```

---

## Credits

- [Arcturus Morningstar](https://git.krews.org/morningstar) — Java Habbo emulator
- [Nitro React](https://github.com/billsonnn/nitro-react) — Modern Habbo web client
- [Model Context Protocol](https://modelcontextprotocol.io/) — Standard interface for AI tools and clients
