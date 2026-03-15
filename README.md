# Habbo Agent Emulator

A fully self-hosted Habbo Hotel with a Claude Code MCP bridge — so your AI agents can walk into the hotel, spawn new avatars, chat with guests, teleport between rooms, and run experiments in a live virtual world.

Built on **Arcturus Morningstar** (Java) + **Nitro React** (TypeScript), extended with an MCP server that connects Claude Code directly to the running hotel.

---

## What Claude can do

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

Install these before running setup:

| Tool | Why | Install |
|------|-----|---------|
| **Docker Desktop** | Runs the hotel (Java, MySQL, Nitro) | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **`just`** | Task runner for hotel commands | `brew install just` / `choco install just` |
| **Node.js 18+** | Runs the MCP server | [nodejs.org](https://nodejs.org/) or `brew install node` |
| **Claude Code** | The AI agent | `npm install -g @anthropic-ai/claude-code` |
| **Anthropic API key** | Powers Claude | [console.anthropic.com](https://console.anthropic.com/) |

**Windows users:** Enable WSL2 and use the Docker Desktop WSL2 backend.

**Disk space:** ~3–4 GB (Docker images + Java build cache + SWF game assets).

---

## Quick start (fresh install)

### 1. Clone

```bash
git clone <repo-url>
cd habbo-agent-emulator
git submodule init && git submodule update
```

### 2. Run setup

```bash
chmod +x setup.sh
./setup.sh
```

The script will:
- Check your prerequisites
- Ask for an API key (or auto-generate one for you)
- Write all config files automatically
- Install MCP server dependencies
- Print the exact Claude Code snippet to copy

### 3. Add the MCP server to Claude Code

Copy the `mcpServers` block printed by `setup.sh` into `~/.claude/settings.json`.

If you already have other MCP servers, merge it into the existing object:

```json
{
  "mcpServers": {
    "habbo": {
      "command": "npx",
      "args": ["tsx", "/path/to/habbo-agent-emulator/habbo-mcp/src/index.ts"],
      "env": {
        "MCP_API_KEY": "your-generated-key",
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

### 4. Start the hotel

```bash
cd emulator
just start-all
```

First run takes **5–10 minutes** — Maven builds the Java server and npm installs the React client.

### 5. Open the hotel

Go to [http://127.0.0.1:1080?sso=123](http://127.0.0.1:1080?sso=123)

### 6. Connect Claude Code

Restart Claude Code and run `/mcp` — you should see `habbo` listed with MCP tools.

### 7. Optional: enable transcript-to-hotel sync

By default, automatic agent transcript sync is **disabled** for safer onboarding and lower CPU usage.

Enable it only when you want transcript-driven bot mirroring:

```bash
# habbo-mcp/.env
AUTO_AGENT_SYNC=true
SYNC_FORWARD_USER_CHAT=true
SYNC_POLL_MS=2000
SYNC_DONE_IDLE_MS=4000
```

Then restart Claude Code so the MCP process reloads env values.

---

## Already running the hotel?

If your emulator is already up in Docker, you only need to set up the MCP server:

```bash
# From the repo root:
./setup.sh
```

Then copy the printed `mcpServers` snippet into `~/.claude/settings.json` and restart Claude Code. That's it — the MCP server runs on your host machine and connects to the already-running Docker containers via the mapped ports (RCON on `localhost:3001`, MySQL on `localhost:13306`).

---

## Publish public container images (GHCR)

This repo includes a GitHub Actions workflow at `.github/workflows/publish-containers.yml` that builds and pushes:

- `ghcr.io/<owner>/habbo-arcturus`
- `ghcr.io/<owner>/habbo-nitro`

It runs on push to `main`, on version tags (`v*`), or manually via **Run workflow**.

Steps:

1. Push this repo to GitHub (with submodules intact).
2. Open **Settings → Actions → General** and allow actions.
3. Push to `main` (or manually trigger workflow).
4. In GitHub Packages, set each container package visibility to **Public**.

For Portainer, use `emulator/docker-compose.registry.yaml` and replace:

- `ghcr.io/OWNER_OR_ORG/habbo-arcturus:latest`
- `ghcr.io/OWNER_OR_ORG/habbo-nitro:latest`

with your actual GHCR image names.

---

## Usage examples

**Ask Claude to spawn an agent:**

> "Create a Habbo avatar named HotelBot, put it in room 1, and make it greet everyone"

Claude will:
1. `create_habbo_player` — spawns HotelBot, gets login URL
2. `move_player_to_room` — teleports HotelBot to room 1
3. `talk_as_player` — says "Welcome to the hotel, everyone!"

**Ask Claude to observe the hotel:**

> "Who's online right now and what are they talking about in room 1?"

Claude will:
1. `get_online_players` — returns the list of active avatars
2. `get_room_chat_log` — reads recent messages from room 1

**Broadcast an announcement:**

> "Send a hotel-wide alert that maintenance starts in 5 minutes"

Claude will call `hotel_alert` with your message.

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

---

## Architecture

```
You (Claude Code)
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

The MCP server is a lightweight Node.js process that Claude Code launches automatically. It never runs inside Docker — it just connects to the already-mapped ports.

---

## Troubleshooting

**Hotel not loading after `just start-all`?**
Wait a few more minutes — the first Maven build is slow. Run `just watch-arcturus` and wait for the "Arcturus Morningstar is now ready" message.

**`/mcp` doesn't show the habbo server in Claude Code?**
Check that the `mcpServers` block is correctly merged into `~/.claude/settings.json` and the path to `index.ts` is absolute and correct.

**RCON tools returning errors?**
Make sure the hotel is fully started (see above). RCON only activates after the "ready" message. Also ensure `./setup.sh` ran successfully — it patches `rcon.allowed` in `config.ini`.

**`create_habbo_player` fails with "username taken"?**
The username already exists in the database. Try a different name.

**MCP server says `MCP_API_KEY` is required?**
The `env` block in `~/.claude/settings.json` must include `MCP_API_KEY`. Re-run `./setup.sh` and copy the full printed snippet.

---

## Project structure

```
habbo-agent-emulator/
├── setup.sh              # First-time setup script
├── README.md             # This file
├── habbo-mcp/            # MCP server (TypeScript)
│   ├── src/
│   │   ├── index.ts      # Entry point
│   │   ├── server.ts     # MCP tool definitions
│   │   ├── rcon.ts       # RCON TCP client
│   │   ├── db.ts         # MySQL helpers
│   │   └── tools/        # One file per MCP tool
│   ├── .env.example      # Config template
│   └── package.json
└── emulator/             # Hotel (Docker Compose)
    ├── docker-compose.yaml
    ├── justfile          # Task runner commands
    ├── emulator/         # Arcturus Java server
    ├── nitro/            # Nitro React client
    └── mysql/            # MariaDB config + schema dumps
```

---

## Credits

- [Arcturus Morningstar](https://git.krews.org/morningstar) — Java Habbo emulator
- [Nitro React](https://github.com/billsonnn/nitro-react) — Modern Habbo web client
- [Model Context Protocol](https://modelcontextprotocol.io/) — Claude tool interface
