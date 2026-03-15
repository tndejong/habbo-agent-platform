#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.registry.yaml"
ROOT_ENV_FILE="${ROOT_ENV_FILE:-$ROOT_DIR/.env}"
MCP_ENV_FILE="${MCP_ENV_FILE:-$ROOT_DIR/habbo-mcp/.env}"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
STACK_RUNNING=false

ENABLE_COLOR=false
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ] && [ "${TERM:-}" != "dumb" ]; then
  ENABLE_COLOR=true
fi

if [ "$ENABLE_COLOR" = "true" ]; then
  C_RESET=$'\033[0m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
  C_BLUE=$'\033[34m'
else
  C_RESET=''
  C_GREEN=''
  C_YELLOW=''
  C_RED=''
  C_BLUE=''
fi

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf "%sPASS%s  %s\n" "$C_GREEN" "$C_RESET" "$1"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  printf "%sWARN%s  %s\n" "$C_YELLOW" "$C_RESET" "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf "%sFAIL%s  %s\n" "$C_RED" "$C_RESET" "$1"
}

info() { printf "%sINFO%s  %s\n" "$C_BLUE" "$C_RESET" "$1"; }

require_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "Command available: $1"
  else
    fail "Missing command: $1"
  fi
}

is_port_free() {
  local bind_host="$1"
  local bind_port="$2"
  python3 - "$bind_host" "$bind_port" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind((host, port))
except OSError:
    sys.exit(1)
else:
    sys.exit(0)
finally:
    s.close()
PY
}

check_port() {
  local label="$1"
  local bind_host="$2"
  local bind_port="$3"
  local on_busy="${4:-fail}"
  shift 4
  local allowed_names=("$@")

  if is_port_free "$bind_host" "$bind_port"; then
    pass "Port free for $label ($bind_host:$bind_port)"
  elif port_used_by_allowed_container "$bind_port" "${allowed_names[@]-}"; then
    pass "Port already mapped by running stack for $label ($bind_host:$bind_port)"
  elif [ "$on_busy" = "warn" ] || [ "$STACK_RUNNING" = "true" ]; then
    warn "Port already in use for $label ($bind_host:$bind_port)"
  else
    fail "Port already in use for $label ($bind_host:$bind_port)"
  fi
}

port_used_by_allowed_container() {
  local host_port="$1"
  shift
  local allowed_names=("$@")
  local name allowed

  while IFS= read -r name; do
    for allowed in "${allowed_names[@]-}"; do
      if [ "$name" = "$allowed" ]; then
        return 0
      fi
    done
  done < <(docker ps --filter "publish=$host_port" --format '{{.Names}}')

  return 1
}

is_running() {
  local container_name="$1"
  docker ps --format '{{.Names}}' | grep -Fxq "$container_name"
}

existing_network_for_subnet() {
  local target_subnet="$1"
  local network_id network_name subnets subnet

  while IFS= read -r network_id; do
    network_name="$(docker network inspect -f '{{.Name}}' "$network_id" 2>/dev/null || true)"
    subnets="$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$network_id" 2>/dev/null || true)"
    for subnet in $subnets; do
      if [ "$subnet" = "$target_subnet" ]; then
        printf '%s\n' "$network_name"
        return 0
      fi
    done
  done < <(docker network ls -q)

  return 1
}

check_subnet() {
  local subnet="$1"
  local tmp_net="habbo-preflight-$$"
  local existing_network

  existing_network="$(existing_network_for_subnet "$subnet" || true)"
  if [ -n "$existing_network" ]; then
    pass "Docker subnet already active on network: $existing_network"
    return
  fi

  if docker network create --driver bridge --subnet "$subnet" "$tmp_net" >/dev/null 2>&1; then
    docker network rm "$tmp_net" >/dev/null 2>&1 || true
    pass "Docker subnet available: $subnet"
  else
    fail "Docker subnet overlaps or invalid: $subnet"
  fi
}

info "Running preflight checks for habbo-agent-platform"

require_cmd docker
require_cmd python3
require_cmd curl
require_cmd nc

if [ -f "$COMPOSE_FILE" ]; then
  pass "Compose file found: docker-compose.registry.yaml"
else
  fail "Missing compose file: docker-compose.registry.yaml"
fi

if docker info >/dev/null 2>&1; then
  pass "Docker daemon reachable"
else
  fail "Docker daemon not reachable. Start Docker Desktop / daemon first."
fi

if is_running arcturus && is_running mysql && is_running nitro; then
  STACK_RUNNING=true
  info "Detected running stack (arcturus/mysql/nitro); busy ports may be expected."
fi

if [ -f "$ROOT_ENV_FILE" ]; then
  info "Loading root env: $ROOT_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_ENV_FILE"
  set +a
  pass "Root env loaded"
else
  warn "No root .env found. Using defaults from compose file."
fi

if [ -f "$MCP_ENV_FILE" ]; then
  info "Loading MCP env: $MCP_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$MCP_ENV_FILE"
  set +a
  pass "MCP env loaded"
else
  fail "Missing MCP env file: $MCP_ENV_FILE"
fi

HABBO_OWNER_OR_ORG="${HABBO_OWNER_OR_ORG:-}"
HABBO_GAME_PORT="${HABBO_GAME_PORT:-3000}"
HABBO_RCON_PORT="${HABBO_RCON_PORT:-3001}"
HABBO_WS_PORT="${HABBO_WS_PORT:-2096}"
HABBO_NITRO_PORT="${HABBO_NITRO_PORT:-1080}"
HABBO_ASSETS_PUBLIC_PORT="${HABBO_ASSETS_PUBLIC_PORT:-8080}"
HABBO_SWF_PUBLIC_PORT="${HABBO_SWF_PUBLIC_PORT:-8081}"
HABBO_DB_PORT="${HABBO_DB_PORT:-13306}"
HABBO_DOCKER_SUBNET="${HABBO_DOCKER_SUBNET:-172.28.0.0/16}"

MCP_API_KEY="${MCP_API_KEY:-}"
SSH_TUNNEL_ENABLED="${SSH_TUNNEL_ENABLED:-false}"
SSH_TUNNEL_HOST="${SSH_TUNNEL_HOST:-}"
SSH_TUNNEL_USER="${SSH_TUNNEL_USER:-}"
SSH_TUNNEL_KEY_PATH="${SSH_TUNNEL_KEY_PATH:-}"
SSH_TUNNEL_LOCAL_RCON_PORT="${SSH_TUNNEL_LOCAL_RCON_PORT:-43001}"
SSH_TUNNEL_LOCAL_DB_PORT="${SSH_TUNNEL_LOCAL_DB_PORT:-43306}"

if [ -n "$HABBO_OWNER_OR_ORG" ]; then
  pass "HABBO_OWNER_OR_ORG set: $HABBO_OWNER_OR_ORG"
elif [ "$STACK_RUNNING" = "true" ]; then
  warn "HABBO_OWNER_OR_ORG is empty (usually only needed for fresh deploy)"
else
  fail "HABBO_OWNER_OR_ORG is empty. Set it in .env (example: tndejong)"
fi

if [ -n "$MCP_API_KEY" ] && [ "$MCP_API_KEY" != "change-me-to-a-secret" ]; then
  pass "MCP_API_KEY configured"
else
  fail "MCP_API_KEY missing or placeholder in habbo-mcp/.env"
fi

check_port "game" "0.0.0.0" "$HABBO_GAME_PORT" fail arcturus
check_port "nitro" "0.0.0.0" "$HABBO_NITRO_PORT" fail nitro
check_port "websocket" "0.0.0.0" "$HABBO_WS_PORT" fail arcturus
check_port "assets" "0.0.0.0" "$HABBO_ASSETS_PUBLIC_PORT" fail nitro
check_port "swf" "0.0.0.0" "$HABBO_SWF_PUBLIC_PORT" fail nitro
check_port "rcon-local-bind" "127.0.0.1" "$HABBO_RCON_PORT" fail arcturus
check_port "mysql-local-bind" "127.0.0.1" "$HABBO_DB_PORT" fail mysql

check_subnet "$HABBO_DOCKER_SUBNET"

if [ "$SSH_TUNNEL_ENABLED" = "true" ]; then
  if [ -z "$SSH_TUNNEL_HOST" ] || [ -z "$SSH_TUNNEL_USER" ] || [ -z "$SSH_TUNNEL_KEY_PATH" ]; then
    fail "SSH tunnel enabled but SSH_TUNNEL_HOST/USER/KEY_PATH not fully configured"
  else
    pass "SSH tunnel core settings configured"
  fi

  if [ -f "$SSH_TUNNEL_KEY_PATH" ]; then
    pass "SSH private key exists: $SSH_TUNNEL_KEY_PATH"
  else
    fail "SSH private key not found: $SSH_TUNNEL_KEY_PATH"
  fi

  check_port "ssh-tunnel-local-rcon" "127.0.0.1" "$SSH_TUNNEL_LOCAL_RCON_PORT" warn
  check_port "ssh-tunnel-local-db" "127.0.0.1" "$SSH_TUNNEL_LOCAL_DB_PORT" warn
else
  warn "SSH tunnel disabled (SSH_TUNNEL_ENABLED=false)"
fi

printf "\n"
info "Preflight summary: PASS=$PASS_COUNT WARN=$WARN_COUNT FAIL=$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
