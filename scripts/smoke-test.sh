#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_DIR="$ROOT_DIR/habbo-mcp"
MCP_ENV_FILE="${MCP_ENV_FILE:-$MCP_DIR/.env}"

ENABLE_COLOR=false
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ] && [ "${TERM:-}" != "dumb" ]; then
  ENABLE_COLOR=true
fi

if [ "$ENABLE_COLOR" = "true" ]; then
  C_RESET=$'\033[0m'
  C_GREEN=$'\033[32m'
  C_RED=$'\033[31m'
  C_BLUE=$'\033[34m'
  C_CYAN=$'\033[36m'
  C_PURPLE=$'\033[35m'
else
  C_RESET=''
  C_GREEN=''
  C_RED=''
  C_BLUE=''
  C_CYAN=''
  C_PURPLE=''
fi

pass() { printf "%sPASS%s  %s\n" "$C_GREEN" "$C_RESET" "$1"; }
fail() { printf "%sFAIL%s  %s\n" "$C_RED" "$C_RESET" "$1"; exit 1; }
info() { printf "%sINFO%s  %s\n" "$C_BLUE" "$C_RESET" "$1"; }
note() { printf "%s....%s  %s\n" "$C_CYAN" "$C_RESET" "$1"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_cmd docker
require_cmd node
require_cmd curl
require_cmd nc

run_with_timeout() {
  local timeout_s="$1"
  shift

  "$@" &
  local cmd_pid=$!

  (
    sleep "$timeout_s"
    if kill -0 "$cmd_pid" >/dev/null 2>&1; then
      kill "$cmd_pid" >/dev/null 2>&1 || true
    fi
  ) &
  local watchdog_pid=$!

  local status=0
  wait "$cmd_pid" || status=$?
  kill "$watchdog_pid" >/dev/null 2>&1 || true
  wait "$watchdog_pid" 2>/dev/null || true
  return "$status"
}

TOTAL_STEPS=5
CURRENT_STEP=0
LAST_ERROR=""
LAST_DEBUG=""

print_progress() {
  local width=30
  local filled=$((CURRENT_STEP * width / TOTAL_STEPS))
  local empty=$((width - filled))
  local filled_bar empty_bar pct
  filled_bar="$(printf '%*s' "$filled" '' | tr ' ' '=')"
  empty_bar="$(printf '%*s' "$empty" '' | tr ' ' '-')"
  pct=$((CURRENT_STEP * 100 / TOTAL_STEPS))
  printf "%sPROG%s  [%s%s] %3d%% (%d/%d)\n" "$C_PURPLE" "$C_RESET" "$filled_bar" "$empty_bar" "$pct" "$CURRENT_STEP" "$TOTAL_STEPS"
}

run_step() {
  local label="$1"
  shift

  LAST_ERROR=""
  LAST_DEBUG=""
  note "$label"

  if "$@"; then
    CURRENT_STEP=$((CURRENT_STEP + 1))
    print_progress
    pass "$label"
  else
    printf "%sPROG%s  [FAILED%s] %3d%% (%d/%d)\n" \
      "$C_PURPLE" "$C_RESET" \
      "$(printf '%*s' 24 '' | tr ' ' '-')" \
      $((CURRENT_STEP * 100 / TOTAL_STEPS)) \
      "$CURRENT_STEP" "$TOTAL_STEPS"
    [ -n "$LAST_DEBUG" ] && printf '%sINFO%s  Debug output:\n%s\n' "$C_BLUE" "$C_RESET" "$LAST_DEBUG"
    fail "${LAST_ERROR:-$label failed}"
  fi
}

check_core_containers() {
  local running_names svc
  running_names="$(docker ps --format '{{.Names}}')"
  for svc in arcturus mysql nitro; do
    if ! printf '%s\n' "$running_names" | grep -Eq "^${svc}$"; then
      LAST_ERROR="Container '$svc' is not running. Start stack first (docker compose -f docker-compose.registry.yaml up -d)"
      return 1
    fi
  done
}

check_rcon_port() {
  if ! nc -z "$RCON_HOST" "$RCON_PORT" >/dev/null 2>&1; then
    LAST_ERROR="RCON not reachable at $RCON_HOST:$RCON_PORT"
    return 1
  fi
}

check_db_port() {
  if ! nc -z "$DB_HOST" "$DB_PORT" >/dev/null 2>&1; then
    LAST_ERROR="MySQL not reachable at $DB_HOST:$DB_PORT"
    return 1
  fi
}

check_hotel_url() {
  if ! curl -fsS --max-time 8 "$HABBO_BASE_URL" >/dev/null; then
    LAST_ERROR="Hotel web endpoint not reachable: $HABBO_BASE_URL"
    return 1
  fi
}

check_mcp_data_path() {
  local mcp_output mcp_result attempt max_attempts
  max_attempts=3
  attempt=1

  while [ "$attempt" -le "$max_attempts" ]; do
    mcp_output="$(
      cd "$MCP_DIR" && run_with_timeout 15 ./node_modules/.bin/tsx -e "
import { getOnlinePlayers } from './src/tools/getOnlinePlayers.ts';
void (async () => {
  const players = await getOnlinePlayers({ limit: 5 });
  console.log(players.length);
})().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
" 2>&1 || true
    )"

    mcp_result="$(printf '%s\n' "$mcp_output" | tail -n 1)"
    if [[ "$mcp_result" =~ ^[0-9]+$ ]]; then
      return 0
    fi

    # Retry a couple of times for transient MySQL pool pressure.
    if printf '%s\n' "$mcp_output" | grep -qi 'Too many connections' && [ "$attempt" -lt "$max_attempts" ]; then
      sleep 1
      attempt=$((attempt + 1))
      continue
    fi

    LAST_ERROR="MCP tool call failed (getOnlinePlayers). Check MCP env, DB tunnel, and dependencies."
    LAST_DEBUG="$mcp_output"
    return 1
  done
}

[ -f "$MCP_ENV_FILE" ] || fail "MCP env file not found: $MCP_ENV_FILE"
[ -f "$MCP_DIR/package.json" ] || fail "Missing habbo-mcp/package.json"
[ -x "$MCP_DIR/node_modules/.bin/tsx" ] || fail "Missing tsx binary. Run: cd habbo-mcp && npm install"

set -a
# shellcheck disable=SC1090
source "$MCP_ENV_FILE"
set +a

[ -n "${MCP_API_KEY:-}" ] || fail "MCP_API_KEY missing in $MCP_ENV_FILE"

RCON_HOST="${RCON_HOST:-127.0.0.1}"
RCON_PORT="${RCON_PORT:-3001}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-13306}"
HABBO_BASE_URL="${HABBO_BASE_URL:-http://127.0.0.1:1080}"

info "Starting smoke test for habbo-agent-platform"
print_progress

run_step "Core containers are running (arcturus/mysql/nitro)" check_core_containers
run_step "RCON reachable at $RCON_HOST:$RCON_PORT" check_rcon_port
run_step "MySQL reachable at $DB_HOST:$DB_PORT" check_db_port
run_step "Hotel web endpoint reachable: $HABBO_BASE_URL" check_hotel_url
run_step "MCP data path OK (getOnlinePlayers)" check_mcp_data_path

info "Smoke test finished successfully"
