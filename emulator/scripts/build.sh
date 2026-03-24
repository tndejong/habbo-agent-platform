#!/bin/bash

set -euo pipefail

apply_config_overrides() {
  local cfg="/app/config.ini"

  if [ ! -f "$cfg" ]; then
    echo "Config file not found at $cfg"
    return
  fi

  # Keep runtime config aligned with container env so deploys are deterministic.
  if [ -n "${RCON_HOST:-}" ]; then
    sed -i "s#^rcon.host=.*#rcon.host=${RCON_HOST}#g" "$cfg"
  fi
  if [ -n "${RCON_PORT:-}" ]; then
    sed -i "s#^rcon.port=.*#rcon.port=${RCON_PORT}#g" "$cfg"
  fi
  if [ -n "${RCON_ALLOWED:-}" ]; then
    sed -i "s#^rcon.allowed=.*#rcon.allowed=${RCON_ALLOWED}#g" "$cfg"
  fi
}

seed_database_if_needed() {
  local db_host db_port db_name db_user db_password
  local table_present sql_base_url base_sql_file migration_sql_file tmp_dir

  # Keep startup robust: prefer explicit env vars and safe defaults.
  db_host="${DB_HOST:-mysql}"
  db_port="${DB_PORT:-3306}"
  db_name="${DB_NAME:-arcturus}"
  db_user="${DB_USER:-arcturus_user}"
  db_password="${DB_PASSWORD:-arcturus_pw}"

  sql_base_url="${HABBO_SQL_BASE_URL:-https://raw.githubusercontent.com/tndejong/habbo-agent-platform/main/mysql/dumps}"
  base_sql_file="${HABBO_SQL_BASE_FILE:-arcturus_3.0.0-stable_base_database--compact.sql}"
  migration_sql_file="${HABBO_SQL_MIGRATION_FILE:-arcturus_migration_3.0.0_to_3.5.0.sql}"

  echo "Waiting for MySQL at ${db_host}:${db_port}..."
  until mysql --ssl=0 -h "$db_host" -P "$db_port" -u"$db_user" -p"$db_password" -Nse "SELECT 1" >/dev/null 2>&1; do
    sleep 1
  done

  table_present="$(mysql --ssl=0 -h "$db_host" -P "$db_port" -u"$db_user" -p"$db_password" "$db_name" -Nse "SHOW TABLES LIKE 'emulator_settings';" 2>/dev/null || true)"
  if [ "$table_present" = "emulator_settings" ]; then
    echo "Database already seeded, skipping bootstrap."
    return
  fi

  echo "Database seed tables missing, bootstrapping from ${sql_base_url}..."
  tmp_dir="$(mktemp -d)"

  wget -q -O "${tmp_dir}/base.sql" "${sql_base_url}/${base_sql_file}"
  wget -q -O "${tmp_dir}/migration.sql" "${sql_base_url}/${migration_sql_file}"

  mysql --ssl=0 -h "$db_host" -P "$db_port" -u"$db_user" -p"$db_password" "$db_name" < "${tmp_dir}/base.sql"
  mysql --ssl=0 -h "$db_host" -P "$db_port" -u"$db_user" -p"$db_password" "$db_name" < "${tmp_dir}/migration.sql"

  rm -rf "$tmp_dir"
  echo "Database bootstrap completed."
}

supervisord -c /app/supervisor/supervisord.conf

seed_database_if_needed
apply_config_overrides

# Point figuredata URL to the local nitro assets server so the emulator does not
# make a blocking outbound HTTPS call to habbo.com at startup.
mysql --ssl=0 -h "${DB_HOST:-mysql}" -P "${DB_PORT:-3306}" \
  -u"${DB_USER:-arcturus_user}" -p"${DB_PASSWORD:-arcturus_pw}" \
  "${DB_NAME:-arcturus}" -e \
  "INSERT INTO emulator_settings (\`key\`, value)
     VALUES ('gamedata.figuredata.url', 'http://nitro:8080/gamedata/FigureData.json')
   ON DUPLICATE KEY UPDATE value='http://nitro:8080/gamedata/FigureData.json';" 2>/dev/null || true

PLUGIN_URL="https://git.krews.org/morningstar/nitrowebsockets-for-ms/-/raw/aff34551b54527199401b343a35f16076d1befd5/target/NitroWebsockets-3.1.jar"
PLUGIN_DIR="/app/arcturus/target/plugins"
PLUGIN_FILE="${PLUGIN_DIR}/NitroWebsockets-3.1.jar"

cd /app/arcturus
mvn package
cp /app/config.ini /app/arcturus/target/config.ini
mkdir -p "$PLUGIN_DIR"

if [ ! -f "$PLUGIN_FILE" ]; then
  echo "Downloading NitroWebsockets plugin..."
  wget -q -O "$PLUGIN_FILE" "$PLUGIN_URL"
else
  echo "NitroWebsockets plugin already present, skipping download."
fi

supervisorctl start arcturus-emulator

tail -f /dev/null