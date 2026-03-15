#!/bin/bash

set -euo pipefail

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