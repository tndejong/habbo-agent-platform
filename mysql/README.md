# MySQL Bundle

`mysql/` contains the database configuration and SQL dumps for the Agent Hotel stack.

## What it provides

- `dumps/` — base Arcturus schema + migration SQL files
- `conf.d/` — MySQL/MariaDB server configuration

## How dumps are applied

### Local (docker-compose.yaml)
The `mysql` service mounts `./mysql/dumps/` into `/docker-entrypoint-initdb.d/`. MariaDB automatically runs all `.sql` files in that folder on **first startup** (only when the data volume is empty).

**You do not need to run the dump manually.** Just run `docker compose up` and the schema is applied automatically.

### Server (docker-compose.registry.yaml)
The `arcturus` container downloads the dump directly from this repository's raw GitHub URL at startup, controlled by:

```
HABBO_SQL_BASE_URL   # base URL to fetch dumps from (default: raw.githubusercontent.com/.../mysql/dumps)
HABBO_SQL_BASE_FILE  # base schema file name
HABBO_SQL_MIGRATION_FILE  # optional migration file
```

Again, **no manual SQL step needed** — the container handles it on first run.

## Re-applying the dump

If you need to reset the database (e.g. after schema changes or a fresh install), delete the MySQL data volume and restart:

```bash
# Local
docker compose down -v
docker compose up -d

# Server
docker compose -f docker-compose.registry.yaml down -v
docker compose -f docker-compose.registry.yaml up -d
```

⚠️ This destroys all data. Only do this on a fresh install or intentional reset.

## Files

| File | Description |
|---|---|
| `dumps/arcturus_3.0.0-stable_base_database--compact.sql` | Full base schema and seed data |
| `dumps/arcturus_migration_3.0.0_to_3.5.0.sql` | Migration from 3.0.0 to 3.5.0 |
| `conf.d/` | MariaDB server config (character sets, etc.) |
