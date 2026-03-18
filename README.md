# Habbo Agent Platform

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![GitHub repo](https://img.shields.io/badge/github-tndejong%2Fhabbo--agent--platform-181717?logo=github)](https://github.com/tndejong/habbo-agent-platform)
[![Publish Containers](https://github.com/tndejong/habbo-agent-platform/actions/workflows/publish-containers.yml/badge.svg)](https://github.com/tndejong/habbo-agent-platform/actions/workflows/publish-containers.yml)
[![Runs in Docker](https://img.shields.io/badge/runs%20in-Docker%20Container-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![MCP Enabled](https://img.shields.io/badge/MCP-Enabled-6E56CF)](https://modelcontextprotocol.io/)

Habbo Agent Platform lets AI clients control a Habbo-style hotel through MCP tools and optional IDE hooks.

Want the fastest way to showcase your own visual AI agents in a retro hotel? Install Claude or Cursor hooks from [habbo-hooks-client](https://github.com/tndejong/habbo-hooks-client) and connect to the hosted MCP.

## Start Here (Dummy-Proof)

Pick one path and ignore the other:

### 1) Beginner (recommended): hosted hotel + hosted MCP

You do **not** run the full hotel stack locally.

1. Register on [https://hotel-portal.fixdev.nl](https://hotel-portal.fixdev.nl)
2. Request your Pro token
3. Configure MCP endpoint `https://hotel-mcp.fixdev.nl/mcp` in Cursor/Claude
4. (Optional) install hooks from [habbo-hooks-client](https://github.com/tndejong/habbo-hooks-client) to trigger office-worker events

For fast hosted usage, users only need the hooks repo:

- [https://github.com/tndejong/habbo-hooks-client](https://github.com/tndejong/habbo-hooks-client)

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

### Hosted MCP (recommended)

Use your token with:

- URL: `https://hotel-mcp.fixdev.nl/mcp`
- Header: `Authorization: Bearer <your-pro-token>`

Cursor example (`~/.cursor/mcp.json`):

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

Fast path for hosted hotel users: clone/use only [habbo-hooks-client](https://github.com/tndejong/habbo-hooks-client).

This repo keeps `hooks/` as a submodule mirror of that client package.

If you want to quickly build and showcase visual agent bots in the retro hotel, install hooks for Claude or Cursor first. That is the fastest developer setup to have your agents appear and act in-hotel.

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

Use remote mode for hosted usage:

```bash
HABBO_HOOK_TRANSPORT=remote
HABBO_HOOK_REMOTE_BASE_URL=https://hotel-mcp.fixdev.nl
HABBO_HOOK_REMOTE_TOKEN=<your-token>
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
