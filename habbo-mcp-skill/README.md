# Habbo MCP — Cursor / Claude Agent Skill

This folder is a **standalone Agent Skill**: it only assumes your editor or agent has an **MCP connection** to a Habbo MCP server (stdio or HTTP). It does **not** depend on a web portal, agent trigger, or this monorepo’s Docker stack.

`SKILL.md` tells the model how to use hotel tools (`deploy_bot`, `talk_bot`, chat logs, etc.) and how to handle auth and client-specific tool name prefixes.

## Use with Cursor

1. **Connect MCP first** — Add your Habbo MCP server in Cursor MCP settings (command + env, or HTTP URL). Confirm tools like `talk_bot` / `deploy_bot` appear (names may be prefixed with the server id).
2. **Install the skill** — Clone this repo (or copy this folder):
   - **Project:** `.cursor/skills/habbo-mcp/`
   - **Personal:** `~/.cursor/skills/habbo-mcp/`
3. Path must be `.../habbo-mcp/SKILL.md`.
4. **Auth** — Either set `MCP_API_KEY` in the MCP server’s env (recommended for local stdio) or pass `api_key` per tool when your host requires it.

## MCP server

You need a running **habbo-mcp** instance (RCON + MySQL to the emulator). A reference implementation ships in the **habbo-agent-platform** monorepo under `habbo-mcp/` (TypeScript MCP server with the tool schemas).

Typical environment variables:

- `MCP_API_KEY` — shared secret or per-user token, depending on deployment
- `RCON_HOST`, `RCON_PORT` — emulator RCON
- `DB_*` — Arcturus database
- `MCP_TRANSPORT` — `stdio` or `http`; HTTP often exposes `https://your-host/mcp`

## Repository layout (Anthropic-style skill repo)

```
.
├── LICENSE
├── README.md
└── SKILL.md
```

Publish this tree as the root of a public GitHub repository so others can subscribe or copy the skill verbatim.

## Contributing

Improve `SKILL.md` in the source monorepo’s `agents/skills/habbo-mcp/` if you develop inside **habbo-agent-platform**; keep this package in sync when cutting releases.
