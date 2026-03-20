# Agent Portal

The web app and API for the Agent Hotel platform. Handles user onboarding, authentication, bot management, and agent team orchestration.

## What it provides

- Register / login with session-based cookie auth
- Password reset flow with email (SMTP)
- "Join Hotel" flow with SSO link generation
- MCP token management for Pro users
- **Agent management** — create and configure AI personas, teams, and task flows
- **Bot management** — register hotel bots, assign figures and personas
- **Live rooms panel** — real-time view of which bots are active in which hotel rooms (via MCP)
- Serves built Vite/React frontend from `dist/`

## Local access

Default URL: `http://127.0.0.1:3090`

## Agent system concepts

### Agents (Personas)
Individual hotel AI personalities. Each has:
- **Job title** — display role (e.g. `Senior backend developer`)
- **Capabilities** — bullet list of what work this agent can do; read by the orchestrator to assign tasks
- **Personality & Hotel Setup** — full markdown instructions: character, behaviour, and how to deploy in the hotel

### Teams
Groups of agents deployed together. Each team has:
- **Execution mode** — `concurrent` (all start at once), `sequential` (one at a time), or `shared` (agents claim tasks from a shared JSON file)
- **Tasks** — ordered task list with title, description, assignee, and dependency links
- **Orchestrator prompt** — custom markdown prompt with variables: `{{ROOM_ID}}`, `{{TRIGGERED_BY}}`, `{{TASKS}}`, `{{PERSONAS}}`

`{{PERSONAS}}` expands to all team members with their capabilities and full instructions. `{{TASKS}}` expands to either a numbered ordered list (sequential) or a `/tmp/hotel-team-tasks.json` write block (shared).

## Local setup — first-time requirements

### In-room AI commands require rank 7

The in-room commands `:set_ai_key` and `:setup_agent` are gated by the Arcturus permissions system. On a fresh database, new hotel accounts default to rank **1** which does not have these permissions — typing the command in the room will silently do nothing.

**Fix — promote the hotel account to rank 7 (superadmin):**

```sql
UPDATE users SET rank = 7 WHERE username = 'yourusername';
```

Or grant the AI commands to all ranks if you want every user to be able to spawn their own bots:

```sql
UPDATE permissions SET cmd_set_ai_key = '1', cmd_setup_agent = '1', cmd_ai_help = '1';
```

**Also verify the `habbo-ai-service` migrations have been applied** (they add the permission columns — without this the commands don't exist at all):

```sql
SHOW COLUMNS FROM permissions LIKE 'cmd_set_ai_key';
```

If that returns empty the `habbo-ai-service` container hasn't run its migrations yet — make sure it started successfully with `just doctor` or `docker compose logs habbo-ai-service`.

**In-room command flow once permissions are correct:**

```
:set_ai_key sk-ant-api01...                            # register + verify Anthropic key
:setup_agent Aria type:agent A friendly assistant      # spawn the bot next to you
```

Available figure types: `default`, `citizen`, `agent`, `bouncer`, `m-employee`

---

### Room 202 must exist before triggering a team

When you trigger a team locally, agent-trigger deploys bots to room **202** by default. This room does not exist automatically — you need to create it manually once in the hotel before the first trigger.

**Steps:**
1. Open the hotel client (`http://127.0.0.1:1080` by default)
2. Log in with your hotel account
3. Create a new room — the first room you create will be assigned ID **202**
4. After the room exists, team triggers will work

If you skip this step the trigger will fail silently — the bots have nowhere to go and the orchestrator prompt receives an invalid room.

> **Tip:** You only need to do this once per fresh database. If you reset the DB volume you'll need to recreate the room.

---

## Environment variables

| Variable | Description |
|---|---|
| `HABBO_PORTAL_PORT` | Host port to expose the portal on (default `3090`) |
| `HABBO_PORTAL_BASE_URL` | Public URL of the Nitro client |
| `HABBO_PORTAL_PUBLIC_URL` | Public URL of the portal itself |
| `HABBO_PORTAL_JWT_SECRET` | Secret for signing JWT tokens |
| `HABBO_PORTAL_COOKIE_SECURE` | Set `true` in production (HTTPS only cookies) |
| `HABBO_PORTAL_SMTP_*` | SMTP config for password reset emails |
| `HABBO_PORTAL_RESET_TOKEN_TTL_MINUTES` | Password reset token expiry |
| `HOTEL_MCP_URL` | Internal MCP endpoint (default `http://habbo-mcp:3003/mcp`) |
| `HOTEL_MCP_API_KEY` | Bearer token for MCP calls (used by live rooms panel) |
| `HOTEL_PORTAL_INTERNAL_SECRET` | Shared secret with agent-trigger for internal API calls |

For full stack values see the root `.env.registry` file.
