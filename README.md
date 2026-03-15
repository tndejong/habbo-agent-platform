# Habbo Agent Platform

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![GitHub repo](https://img.shields.io/badge/github-tndejong%2Fhabbo--agent--platform-181717?logo=github)](https://github.com/tndejong/habbo-agent-platform)
[![DEV Article](https://img.shields.io/badge/DEV-Read%20the%20build%20story-0A0A0A?logo=devdotto&logoColor=white)](https://dev.to/tijmen_de_jong/building-agent-emulator-habbo-emulator-mcp-4ob4)
[![Publish Containers](https://github.com/tndejong/habbo-agent-platform/actions/workflows/publish-containers.yml/badge.svg)](https://github.com/tndejong/habbo-agent-platform/actions/workflows/publish-containers.yml)
[![Runs in Docker](https://img.shields.io/badge/runs%20in-Docker%20Container-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![MCP Enabled](https://img.shields.io/badge/MCP-Enabled-6E56CF)](https://modelcontextprotocol.io/)

A fully self-hosted Habbo Hotel with an MCP bridge — so your AI agents can walk into the hotel, spawn new avatars, chat with guests, teleport between rooms, and run experiments in a live virtual world.

Built on **Arcturus Morningstar** (Java) + **Nitro React** (TypeScript), extended with an MCP server that connects any MCP-compatible platform directly to the running hotel.

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start with Docker](#quick-start-with-docker)
- [MCP Client Configuration](#mcp-client-configuration)
- [Smoke Test (5 Minutes)](#smoke-test-5-minutes)
- [Deploy with Portainer (Easy Mode)](#deploy-with-portainer-easy-mode)
- [Production Notes](#production-notes)
- [Nginx Proxy Manager + Custom Domain](#nginx-proxy-manager--custom-domain)
- [Usage Examples](#usage-examples)
- [Hook Compatibility](#hook-compatibility)
- [Hotel Management Commands](#hotel-management-commands)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [Credits](#credits)

---

## About

`habbo-agent-platform` lets you run a self-hosted Habbo hotel and control it through MCP tools from any MCP-compatible platform.
It is optimized for quick deployment using Docker or Portainer with prebuilt GHCR images.
Claude Code is supported, but not required.

---

## Features

### MCP tools (what your MCP client can do)

| Tool | What it does | Requires player online? |
|------|-------------|------------------------|
| `create_habbo_player` | Spawn a new avatar and get a login URL | No |
| `generate_sso_ticket` | New login link for an existing player | No |
| `talk_as_player` | Make an avatar talk, whisper, or shout | Yes |
| `move_player_to_room` | Teleport an avatar to any room | Yes |
| `give_credits` | Hand out in-game currency | Yes |
| `alert_player` | Send a pop-up message to a player | Yes |
| `set_player_motto` | Update an avatar's profile tagline | Yes |
| `get_online_players` | See who's in the hotel right now | No |
| `get_room_chat_log` | Read recent chat from any room | No |
| `hotel_alert` | Broadcast a message to everyone online | No |

---

## Prerequisites

Install these before deploying or connecting MCP:

| Tool | Why | Install |
|------|-----|---------|
| **Docker Desktop** | Runs the hotel (Java, MySQL, Nitro) | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **`just`** (optional) | Useful local helper commands (`just start-all`, `just watch-*`) | `brew install just` / `choco install just` |
| **Node.js 18+** | Runs the MCP server | [nodejs.org](https://nodejs.org/) or `brew install node` |
| **MCP-compatible client** | Connects to `habbo-mcp` and calls tools | Claude Code, Cursor, or any MCP client |
| **Client/API credentials** | Required by your chosen MCP client/provider | Depends on the platform you use |

**Windows users:** Enable WSL2 and use the Docker Desktop WSL2 backend.

**Disk space:** ~3–4 GB (Docker images + Java build cache + SWF game assets).

---

## Quick start with Docker

Use the prebuilt images from this repository's GitHub Container Registry package.
No custom registry setup is required for normal usage.
For new users, this is the recommended path.

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

Optional but useful:

```bash
HABBO_NITRO_PORT=1080
HABBO_GAME_PORT=3000
HABBO_RCON_PORT=3001
HABBO_DB_PORT=13306
HABBO_DOCKER_SUBNET=172.28.0.0/16
```

### 3. Start the stack

```bash
docker compose --env-file .env.registry -f docker-compose.registry.yaml up -d
```

### 4. Wait for first boot

First startup can take several minutes:
- Arcturus compiles on first run
- Nitro may auto-convert assets when missing
- DB seed is auto-imported if required tables are missing

Check status:

```bash
docker compose -f docker-compose.registry.yaml logs -f arcturus
docker compose -f docker-compose.registry.yaml logs -f nitro
```

### 5. Open the hotel

[http://127.0.0.1:1080?sso=123](http://127.0.0.1:1080?sso=123)

---

## MCP Client Configuration

After the hotel stack is running, connect your MCP client to `habbo-mcp`.

### Required environment values

Use these values in your MCP client config:

```bash
MCP_API_KEY=replace-with-your-key
RCON_HOST=127.0.0.1
RCON_PORT=3001
DB_HOST=127.0.0.1
DB_PORT=13306
DB_NAME=arcturus
DB_USER=arcturus_user
DB_PASSWORD=arcturus_pw
HABBO_BASE_URL=http://127.0.0.1:1080
```

You can generate `MCP_API_KEY` with:

```bash
openssl rand -hex 16
```

### Claude Code example (`~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "habbo": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/habbo-agent-platform/habbo-mcp/src/index.ts"],
      "env": {
        "MCP_API_KEY": "replace-with-your-key",
        "RCON_HOST": "127.0.0.1",
        "RCON_PORT": "3001",
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "13306",
        "DB_NAME": "arcturus",
        "DB_USER": "arcturus_user",
        "DB_PASSWORD": "arcturus_pw",
        "HABBO_BASE_URL": "http://127.0.0.1:1080"
      }
    }
  }
}
```

### Cursor example

Configure the same `habbo` MCP server values in Cursor MCP settings (command/args/env). Use absolute paths and restart Cursor after changes.

---

## Smoke test (5 minutes)

1. Open the hotel URL and confirm client loads.
2. In your MCP client, verify the `habbo` server appears.
3. Run one read tool:
   - `get_online_players`
4. Run one write/action tool:
   - `hotel_alert` with a short test message

If all four pass, your stack + MCP connection is healthy.

---

## Deploy with Portainer (easy mode)

1. In Portainer, create a new Stack.
2. Paste `docker-compose.registry.yaml`.
3. Add environment variables in the Stack UI:
   - `HABBO_OWNER_OR_ORG=tndejong`
   - `HABBO_PUBLIC_HOST=<your-domain-or-ip>`
   - `HABBO_PUBLIC_PROTOCOL=http` (or `https` behind a proxy)
   - Optional custom ports/subnet if needed
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

If you run NPM, you can proxy Nitro by joining this stack to the same external Docker network (for example `proxy_net`) and forwarding to `nitro:5154`.

1. Ensure both stacks share the same external network.
2. In NPM Proxy Host:
   - Domain: your domain
   - Forward host: `nitro`
   - Forward port: `5154`
   - Enable websocket support
3. Set:
   - `HABBO_PUBLIC_HOST=<your-domain>`
   - `HABBO_PUBLIC_PROTOCOL=https`
   - Optional `HABBO_WS_PUBLIC_PROTOCOL=wss`

Compose network example:

```yaml
services:
  nitro:
    networks:
      - nitro
      - proxy_net

networks:
  nitro:
    ipam:
      config:
        - subnet: ${HABBO_DOCKER_SUBNET:-172.28.0.0/16}
  proxy_net:
    external: true
```

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

Hooks are not limited to Cursor or Claude Code. They can work with any MCP-capable setup that can invoke the hook script and/or provide transcript files.

- Base event hook script: `habbo-mcp/src/hooks/habboAgentHook.ts`
- Optional transcript sync loop: enabled with `AUTO_AGENT_SYNC=true`

Important defaults:
- Transcript sync defaults to `~/.cursor/projects` (Cursor-style transcript location).
- If you use a different platform, set `SYNC_TRANSCRIPTS_ROOT` to your transcript root path.
- You can also override checkpoint/lock files with `SYNC_CHECKPOINT_FILE` and `SYNC_LOCK_FILE`.

Example for non-Cursor transcript locations:

```bash
AUTO_AGENT_SYNC=true
SYNC_TRANSCRIPTS_ROOT=/path/to/your/transcripts/root
SYNC_CHECKPOINT_FILE=/path/to/.habbo-sync-checkpoint.json
SYNC_LOCK_FILE=/path/to/.habbo-sync.lock
```

If `AUTO_AGENT_SYNC` is `false` (default), none of these transcript paths are required.

---

## Hotel management commands

```bash
cd emulator

just start-all           # Start hotel (MySQL + Arcturus + Nitro)
just stop-arcturus       # Stop the Java emulator
just start-arcturus      # Start it again
just restart-arcturus    # Full restart
just recompile-arcturus  # Rebuild after Java code changes
just watch-arcturus      # Tail emulator logs
just watch-nitro         # Tail frontend logs
just mysql               # Open MySQL console
just shell-arcturus      # SSH into the Arcturus container
just shell-nitro         # SSH into the Nitro container
just extract-nitro-assets # Convert SWF assets (first run only)
just clean-docker        # Wipe everything and start fresh
```

`just extract-nitro-assets` is usually no longer required manually, because startup now auto-extracts missing Nitro assets.

---

## Architecture

```
You (MCP-compatible client)
      │
      │  MCP protocol (stdio)
      ▼
habbo-mcp/              (Node.js + TypeScript, runs on host)
      │
      ├── RCON TCP :3001 ──► Arcturus Java Server :3000
      │                            │
      └── MySQL :13306  ──────────┘
                                   │
                            Nitro React :1080
                         (browser-based client)
```

The MCP server is a lightweight Node.js process your MCP client launches (or connects to). It never runs inside Docker — it just connects to the already-mapped ports.

---

## Troubleshooting

**Hotel not loading after `just start-all`?**
Wait a few more minutes — the first Maven build is slow. Run `just watch-arcturus` and wait for the "Arcturus Morningstar is now ready" message.

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
Set `MCP_API_KEY` in the environment config used by your MCP client for the `habbo` server.

---

## Project structure

```
habbo-agent-platform/
├── README.md             # This file
├── docker-compose.registry.yaml
├── habbo-mcp/            # MCP server (TypeScript)
│   ├── src/
│   │   ├── index.ts      # Entry point
│   │   ├── server.ts     # MCP tool definitions
│   │   ├── rcon.ts       # RCON TCP client
│   │   ├── db.ts         # MySQL helpers
│   │   └── tools/        # One file per MCP tool
│   ├── .env.example      # Config template
│   └── package.json
└── emulator/             # Hotel (source build stack)
    ├── docker-compose.yaml
    ├── justfile
    ├── emulator/         # Arcturus Java server
    ├── nitro/            # Nitro React client
    └── mysql/            # MariaDB config + schema dumps
```

---

## Credits

- [Arcturus Morningstar](https://git.krews.org/morningstar) — Java Habbo emulator
- [Nitro React](https://github.com/billsonnn/nitro-react) — Modern Habbo web client
- [Model Context Protocol](https://modelcontextprotocol.io/) — Standard interface for AI tools and clients
