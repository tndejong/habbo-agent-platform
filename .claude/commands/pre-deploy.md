---
description: "Pre-deploy check: analyze diff, propose version tag, draft commit and Dutch release note, confirm, then commit + tag + push + post to Discord/Teams."
---

# Pre-Deploy Analysis — habbo-agent-platform

Run from the repo root. Single repo, single tag stream (`vMAJOR.MINOR.PATCH`).

## Step 1 — Collect git state (parallel)

```bash
git status --short
git diff HEAD
git diff HEAD -- .env.example
git tag --list | sort -V | tail -8
git log --oneline -10
```

`portal/package.json` is the canonical version manifest for the UI footer. Other services (`habbo-ai-service`, `habbo-mcp`, `agent-trigger`, `nitro-imager`) pin to `1.0.0`/`1.1.0` and are not bumped per release — only `portal/package.json` and the git tag move together.

## Step 2 — Next version

- Read highest semver tag from `git tag --list | sort -V | tail -1`.
- Bump:
  - **patch** — bug fixes, small UI tweaks, refactors with no new features
  - **minor** — new features, new pages, new API routes, new DB tables/migrations, new env vars
  - **major** — breaking changes
- Update `portal/package.json` `"version"` to match (without the `v` prefix) as part of the commit.

## Step 3 — New env variables

Scan diff for:
- `+` lines in `.env.example`
- New `process.env.X` / `import.meta.env.VITE_*` references in code changes

Flag each new key with a one-line "used in <file/service>".

## Step 4 — New connections / services

Scan diff for:
- New migration files under `portal/server/db/migrations/`
- New tables / `ALTER TABLE` in those migrations
- New third-party imports in any `package.json`
- New API base URLs or `fetch(` targets

## Step 5 — Permission impact

This repo gates routes via `permRequired('<key>')` (in `portal/server.js`, `portal/server/routes/**`) and UI via `can(me, '<key>')` (in `portal/src/**`). The registry lives in `portal/src/utils/permissions.js` and is mirrored in `portal/server.js`.

```bash
git diff HEAD -- portal/server.js portal/server/routes/ | grep -E "^\+.*permRequired\(" | sed "s/.*permRequired('//" | sed "s/').*//" | sort -u
git diff HEAD -- portal/src/ | grep -E "^\+.*can\(me," | sed -E "s/.*can\(me,\s*'([^']+)'.*/\1/" | sort -u
```

For each unique permission key in the diff, produce a row: key, who can access (`minTier` + `requiresDev` from the registry), changed (✓ new / ✓ modified / —).

**Flag:**
- 🔴 New `app.post|put|delete|patch` route without `permRequired(` → "Route unprotected"
- 🔴 New JSX data-write control without `can(me,` guard → "Frontend write unguarded"
- 🟡 Permission key used in code but missing from the registry → "Permission key undeclared"

## Step 6 — Pre-Deploy Report (output to chat)

````
## Pre-Deploy Analysis

### Changes
<bullets per file/area — feature, fix, refactor>

---

### 🔐 Permission Impact

| Permission | Who can access | Changed? |
|------------|----------------|----------|
| `<key>` | `<minTier>` [+ developer] | ✓ new / ✓ modified / — |

— or — **N/A** (no permission changes)

---

### ⚠️ Server Action Required Before Deploy

#### New Env Variables
| Variable | Required? | Notes |
|----------|-----------|-------|

#### New Migrations
- `portal/server/db/migrations/00XX_*.sql` — <one-liner>

#### New Connections / Services
- [ ] <description>

#### None found
(if nothing detected)

---

### Version
- Latest tag: `v0.X.Y`
- **Next tag: `v0.X.Z`** (patch / minor / major — reason)
- `portal/package.json` will be updated to `0.X.Z`

### Commit Message

```
<type>(<scope>): <short description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`.

---

### 📣 Release Note (Dutch)

Tone: natural Dutch, English allowed for product terms (*agents*, *AI*, *MCP*, *workflow*, brand/product names). No deployment how-to in the release note — that belongs only in **§ Server Action Required Before Deploy** above.

Max ~800 chars (single Discord message). Use Discord markdown.

Title patterns:
- `🚀 **Habbo Agent Platform — v0.X.Y staat live!**`
- or short, derived from the headline change

Body shape:
- 1 zin context (what does this release mean for the reader)
- **Wat is er nieuw:** bullet list, max 5
- (optioneel) afsluiter / call-to-action
````

## Step 6b — Mandatory reply block

After the report, **always** include the reply block below — use `AskUserQuestion` in addition if available, never instead.

Detect release webhooks from `.env` at repo root (only test presence, never print secrets):
```bash
grep -qE '^DISCORD_RELEASE_WEBHOOK_URL=.+' .env && echo "discord=on" || echo "discord=off"
grep -qE '^TEAMS_RELEASE_WEBHOOK_URL=.+' .env && echo "teams=on" || echo "teams=off"
```

Print one line in the report:
- `Release webhooks: Discord ✓ · Teams ✗` (use ✓/✗ per detection)

Then the reply block (substitute the real tag for `vX.X.X`):

```markdown
**Commit / git** (next tag **vX.X.X** — `portal/package.json` will match)

| | |
|--|--|
| **A** | Commit with the proposed message, tag **vX.X.X**, push |
| **B** | I'll send my own commit message next — then commit, tag, push |
| **C** | Do **not** commit or tag |

**Release note**

| | |
|--|--|
| **1** | Post to **Discord** now (if `Discord ✓`) |
| **2** | Post to **Teams** now (if `Teams ✓`) |
| **3** | Skip — I'll copy it myself |

**Your reply:** e.g. `A + 1`, `A + 3`, or `C`.
```

Only show options 1/2 that correspond to detected channels. If neither is on, show only "I'll copy it myself".

## Step 7 — Commit, tag, push (on A or B confirmation)

```bash
# Update portal/package.json version (use Edit, not sed)
# Stage everything
git add -A
git commit -m "<agreed message>"
git tag vX.X.Z
git push && git push --tags
```

If user picked **B**, wait for the commit message in chat before running. Do not re-confirm.

## Step 8 — Post release note

### 8a — Discord (if `1` chosen and `DISCORD_RELEASE_WEBHOOK_URL` set)

Use the global script — it reads `.env` from the repo root:

```bash
RELEASE_NOTE="$(cat <<'EOF'
<paste Dutch release note from Step 6 — no deploy commands>
EOF
)" node ~/.cursor/scripts/post-release-discord.mjs
```

Optional GIF: set `RELEASE_GIPHY_URL=https://media.giphy.com/.../giphy.gif` alongside `RELEASE_NOTE`.

HTTP 204 = success. Any other status → show body, offer copy-paste.

### 8b — Teams (if `2` chosen and `TEAMS_RELEASE_WEBHOOK_URL` set)

```bash
RELEASE_NOTE="$(cat <<'EOF'
<paste Dutch release note>
EOF
)" node ~/.cursor/scripts/post-release-teams.mjs
```

HTTP 200/202 = accepted. Confirm in Teams that the card appeared.

If the chosen channel's URL is missing, say so and offer copy-paste only.

---

## Notes

- Never commit `.env`. `.env.example` only.
- Tag format is always `vMAJOR.MINOR.PATCH`.
- Deploy is Coolify-from-main (see `5db7208`) — once pushed to `main`, GHCR builds + Coolify redeploys. Don't `--force-push` to main; never skip hooks (`--no-verify`).
- If running with no real changes, do not create an empty commit — say so and stop.
