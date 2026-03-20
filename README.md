# Habbo Agent Platform

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![GitHub repo](https://img.shields.io/badge/github-tndejong%2Fhabbo--agent--platform-181717?logo=github)](https://github.com/tndejong/habbo-agent-platform)
[![Publish Containers](https://github.com/tndejong/habbo-agent-platform/actions/workflows/publish-containers.yml/badge.svg)](https://github.com/tndejong/habbo-agent-platform/actions/workflows/publish-containers.yml)
[![Runs in Docker](https://img.shields.io/badge/runs%20in-Docker%20Container-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![MCP Enabled](https://img.shields.io/badge/MCP-Enabled-6E56CF)](https://modelcontextprotocol.io/)

Habbo Agent Platform lets AI clients control a Habbo-style hotel through MCP tools and optional IDE hooks.

Want the fastest way to showcase your own visual AI agents in a retro hotel? Install Claude or Cursor hooks from [habbo-hooks-client](https://github.com/tndejong/habbo-hooks-client) and connect to the hosted MCP.

---

## Navigation

| Module | Description |
|---|---|
| [`portal/`](portal/README.md) | Web app & API — user auth, agent management, bot control, live rooms |
| [`habbo-mcp/`](habbo-mcp/README.md) | MCP server — hotel tool calls for AI clients |
| [`hooks/`](hooks/README.md) | IDE hook installer — relay agent events into the hotel |
| [`mysql/`](mysql/README.md) | Database schema, dumps, and MariaDB config |
| [`habbo-ai-service/`](habbo-ai-service/README.md) | Hotel-to-AI provider bridge |
| [`nitro-imager/`](nitro-imager/README.md) | Avatar figure rendering service |
| [`nitro/`](nitro/README.md) | Hotel frontend (Nitro client stack) |
| [`emulator/`](emulator/README.md) | Core hotel emulator (Arcturus) |

---

## Fastest Setup (Hosted)

This is the main selling point: show your own agents/subagents in the hosted retro hotel without running the full stack locally.

1. Register on [https://hotel-portal.fixdev.nl](https://hotel-portal.fixdev.nl)
2. Request Pro tier and copy your MCP token
3. Clone [habbo-hooks-client](https://github.com/tndejong/habbo-hooks-client)
4. Run one install command (Claude or Cursor)

```bash
git clone https://github.com/tndejong/habbo-hooks-client.git
cd habbo-hooks-client

# set once in your shell session (auto = tries hosted first, falls back to local)
export HABBO_HOOK_TRANSPORT=auto
export MCP_API_KEY="<your-pro-token>"

# choose one installer
bash ./claude/install.sh
bash ./cursor/install.sh
```

Paste this MCP config in your IDE (required for tool calls):

Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "hotel-mcp": {
      "url": "https://hotel-mcp.fixdev.nl/mcp",
      "headers": {
        "Authorization": "Bearer <your-pro-token>"
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add --transport http hotel-mcp https://hotel-mcp.fixdev.nl/mcp \
  -H "Authorization: Bearer <your-pro-token>"
```

## Start Here (Dummy-Proof)

Pick one path and ignore the other:

### 1) Beginner (recommended): hosted hotel + hosted MCP

You do **not** run the full hotel stack locally.

1. Register on [https://hotel-portal.fixdev.nl](https://hotel-portal.fixdev.nl)
2. Request Pro tier and copy your MCP token
3. Follow **Fastest Setup (Hosted)** above

### 2) Expert: run everything locally

Use this only for self-hosting, deep customization, or development.

```bash
just setup
just up
just doctor
```

---

## What You Get In This Repo

### Agent Hotel Bundle (server side)

- `nitro` + `nitro-imager` - hotel frontend emulation and figure rendering
- `portal` - login/register frontend and onboarding
- `mysql` - schema, dumps, and DB config
- `habbo-ai-service` - hotel-to-AI provider bridge
- `emulator` - core hotel emulator backend
- `habbo-mcp` - MCP server package for hotel control

### Client Bundle (local integration)

- `hooks` - git submodule pointing to [habbo-hooks-client](https://github.com/tndejong/habbo-hooks-client)
- Hooks can target:
  - local stack (expert mode)
  - hosted MCP backend (`https://hotel-mcp.fixdev.nl`)

---

## MCP Setup Examples

Hosted MCP setup is already shown in **Fastest Setup (Hosted)**.

### Local MCP (expert)

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

---

## Hook Setup (Optional)

For hosted usage, use [habbo-hooks-client](https://github.com/tndejong/habbo-hooks-client).

This monorepo keeps `hooks/` as a submodule mirror of that client package.

Hooks can be installed per application (events differ between Claude and Cursor), or together.

Install both:

```bash
just hooks-install
just hooks-status
just hooks-uninstall
```

Install only one app (optional):

```bash
just hooks-install claude
just hooks-install cursor
just hooks-status claude
just hooks-status cursor
just hooks-uninstall claude
just hooks-uninstall cursor
```

Underlying domain scripts:

- Claude: `hooks/claude/install.sh`
- Cursor: `hooks/cursor/install.sh`

Recommended defaults (works for both hosted and local):

```bash
HABBO_HOOK_TRANSPORT=auto
HABBO_HOOK_REMOTE_BASE_URL=https://hotel-mcp.fixdev.nl
MCP_API_KEY=<your-token>
```

Full hook docs: `hooks/README.md`

---

## Bundle Docs (Detailed)

If you need deeper info, use the bundle README files:

- `habbo-mcp/README.md`
- `hooks/README.md`
- `portal/README.md`
- `habbo-ai-service/README.md`
- `emulator/README.md`
- `mysql/README.md`
- `nitro/README.md`
- `nitro-imager/README.md`

---

## Common Commands (Expert Local)

```bash
just setup
just preflight
just smoke
just doctor
just up
just down
just mcp-install
just mcp-dev
just hooks-install
just hooks-status
just hooks-uninstall
```

---

## Project Structure

```text
habbo-agent-platform/
├── emulator/          # hotel emulator backend
├── habbo-ai-service/  # hotel -> AI bridge
├── habbo-mcp/         # MCP server package
├── hooks/             # shared hook runtime + app-specific installers
├── mysql/             # schema/dumps/config
├── nitro/             # hotel frontend stack
├── nitro-imager/      # figure image service
├── portal/            # login/register frontend
└── scripts/           # preflight/smoke helpers
```

---

## Credits

- [Arcturus Morningstar](https://git.krews.org/morningstar)
- [Nitro React](https://github.com/billsonnn/nitro-react)
- [Model Context Protocol](https://modelcontextprotocol.io/)
