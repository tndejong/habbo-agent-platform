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
