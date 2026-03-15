#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="$SCRIPT_DIR/habbo-mcp"
MCP_ENV_FILE="$MCP_DIR/.env"
MCP_ENV_EXAMPLE="$MCP_DIR/.env.example"
REGISTRY_ENV_FILE="$SCRIPT_DIR/.env.registry"

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
  C_CYAN=$'\033[36m'
else
  C_RESET=''
  C_GREEN=''
  C_YELLOW=''
  C_RED=''
  C_BLUE=''
  C_CYAN=''
fi

print_header() {
  printf "\n%s========================================%s\n" "$C_CYAN" "$C_RESET"
  printf "%s  Habbo Agent Platform Setup Wizard%s\n" "$C_CYAN" "$C_RESET"
  printf "%s========================================%s\n\n" "$C_CYAN" "$C_RESET"
}

pass() { printf "%sPASS%s  %s\n" "$C_GREEN" "$C_RESET" "$1"; }
warn() { printf "%sWARN%s  %s\n" "$C_YELLOW" "$C_RESET" "$1"; }
fail() { printf "%sFAIL%s  %s\n" "$C_RED" "$C_RESET" "$1"; exit 1; }
info() { printf "%sINFO%s  %s\n" "$C_BLUE" "$C_RESET" "$1"; }

prompt() {
  local text="$1"
  local default_value="${2:-}"
  local value
  if [ -n "$default_value" ]; then
    read -r -p "$text [$default_value]: " value
    printf "%s" "${value:-$default_value}"
  else
    read -r -p "$text: " value
    printf "%s" "$value"
  fi
}

confirm_no_default() {
  local question="$1"
  local reply
  read -r -p "$question [y/N]: " reply
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

load_env_file() {
  local file_path="$1"
  if [ -f "$file_path" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$file_path"
    set +a
  fi
}

generate_api_key() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))"
  fi
}

check_prerequisites() {
  info "Checking prerequisites..."
  local missing=()
  local cmd
  for cmd in docker node npm; do
    if command -v "$cmd" >/dev/null 2>&1; then
      pass "Command available: $cmd"
    else
      missing+=("$cmd")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    fail "Missing required commands: ${missing[*]}"
  fi

  local node_major
  node_major="$(node -e "process.stdout.write(process.versions.node.split('.')[0])")"
  if [ "$node_major" -lt 18 ]; then
    fail "Node.js 18+ required (found $node_major)"
  fi
  pass "Node.js version supported: $node_major"
}

write_registry_env() {
  local habbo_owner_or_org="$1"
  local habbo_public_host="$2"
  local habbo_public_protocol="$3"
  local habbo_nitro_port="$4"
  local habbo_game_port="$5"
  local habbo_rcon_port="$6"
  local habbo_db_port="$7"
  local habbo_docker_subnet="$8"

  cat > "$REGISTRY_ENV_FILE" <<EOF
HABBO_OWNER_OR_ORG=$habbo_owner_or_org
HABBO_PUBLIC_HOST=$habbo_public_host
HABBO_PUBLIC_PROTOCOL=$habbo_public_protocol
HABBO_NITRO_PORT=$habbo_nitro_port
HABBO_GAME_PORT=$habbo_game_port
HABBO_RCON_PORT=$habbo_rcon_port
HABBO_DB_PORT=$habbo_db_port
HABBO_DOCKER_SUBNET=$habbo_docker_subnet
EOF

  pass "Wrote $REGISTRY_ENV_FILE"
}

write_mcp_env() {
  cat > "$MCP_ENV_FILE" <<EOF
RCON_HOST=${RCON_HOST}
RCON_PORT=${RCON_PORT}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
MCP_API_KEY=${MCP_API_KEY}
HABBO_BASE_URL=${HABBO_BASE_URL}

# Optional: start an SSH tunnel automatically before MCP boot
SSH_TUNNEL_ENABLED=${SSH_TUNNEL_ENABLED}
SSH_TUNNEL_HOST=${SSH_TUNNEL_HOST}
SSH_TUNNEL_PORT=${SSH_TUNNEL_PORT}
SSH_TUNNEL_USER=${SSH_TUNNEL_USER}
SSH_TUNNEL_KEY_PATH=${SSH_TUNNEL_KEY_PATH}
SSH_TUNNEL_STRICT_HOST_KEY_CHECKING=${SSH_TUNNEL_STRICT_HOST_KEY_CHECKING}
SSH_TUNNEL_CONNECT_TIMEOUT_SEC=${SSH_TUNNEL_CONNECT_TIMEOUT_SEC}
SSH_TUNNEL_START_TIMEOUT_MS=${SSH_TUNNEL_START_TIMEOUT_MS}
SSH_TUNNEL_LOCAL_RCON_PORT=${SSH_TUNNEL_LOCAL_RCON_PORT}
SSH_TUNNEL_REMOTE_RCON_HOST=${SSH_TUNNEL_REMOTE_RCON_HOST}
SSH_TUNNEL_REMOTE_RCON_PORT=${SSH_TUNNEL_REMOTE_RCON_PORT}
SSH_TUNNEL_LOCAL_DB_PORT=${SSH_TUNNEL_LOCAL_DB_PORT}
SSH_TUNNEL_REMOTE_DB_HOST=${SSH_TUNNEL_REMOTE_DB_HOST}
SSH_TUNNEL_REMOTE_DB_PORT=${SSH_TUNNEL_REMOTE_DB_PORT}

AUTO_AGENT_SYNC=${AUTO_AGENT_SYNC}
SYNC_FORWARD_USER_CHAT=${SYNC_FORWARD_USER_CHAT}
SYNC_POLL_MS=${SYNC_POLL_MS}
SYNC_DONE_IDLE_MS=${SYNC_DONE_IDLE_MS}
SYNC_OPERATOR_USERNAME=${SYNC_OPERATOR_USERNAME}
SYNC_SPAWN_X=${SYNC_SPAWN_X}
SYNC_SPAWN_Y=${SYNC_SPAWN_Y}
EOF
  pass "Wrote $MCP_ENV_FILE"
}

safe_write_file() {
  local target_path="$1"
  local writer_fn="$2"

  if [ -f "$target_path" ]; then
    if confirm_no_default "Existing $(basename "$target_path") found. Overwrite?"; then
      cp "$target_path" "${target_path}.backup"
      pass "Backup created: ${target_path}.backup"
      "$writer_fn"
    else
      warn "Skipped overwrite for $target_path"
    fi
  else
    "$writer_fn"
  fi
}

print_client_snippet() {
  local mcp_entry="$MCP_DIR/src/index.ts"
  printf "\n"
  info "Use this MCP server config in your client (Cursor/Claude/other):"
  cat <<EOF
{
  "mcpServers": {
    "habbo": {
      "command": "npx",
      "args": ["tsx", "$mcp_entry"],
      "env": {
        "MCP_API_KEY": "$MCP_API_KEY",
        "RCON_HOST": "$RCON_HOST",
        "RCON_PORT": "$RCON_PORT",
        "DB_HOST": "$DB_HOST",
        "DB_PORT": "$DB_PORT",
        "DB_NAME": "$DB_NAME",
        "DB_USER": "$DB_USER",
        "DB_PASSWORD": "$DB_PASSWORD",
        "HABBO_BASE_URL": "$HABBO_BASE_URL",
        "SSH_TUNNEL_ENABLED": "$SSH_TUNNEL_ENABLED",
        "SSH_TUNNEL_HOST": "$SSH_TUNNEL_HOST",
        "SSH_TUNNEL_PORT": "$SSH_TUNNEL_PORT",
        "SSH_TUNNEL_USER": "$SSH_TUNNEL_USER",
        "SSH_TUNNEL_KEY_PATH": "$SSH_TUNNEL_KEY_PATH",
        "SSH_TUNNEL_LOCAL_RCON_PORT": "$SSH_TUNNEL_LOCAL_RCON_PORT",
        "SSH_TUNNEL_REMOTE_RCON_PORT": "$SSH_TUNNEL_REMOTE_RCON_PORT",
        "SSH_TUNNEL_LOCAL_DB_PORT": "$SSH_TUNNEL_LOCAL_DB_PORT",
        "SSH_TUNNEL_REMOTE_DB_PORT": "$SSH_TUNNEL_REMOTE_DB_PORT"
      }
    }
  }
}
EOF
}

print_header
check_prerequisites

[ -f "$MCP_ENV_EXAMPLE" ] || fail "Missing $MCP_ENV_EXAMPLE"
load_env_file "$MCP_ENV_EXAMPLE"
load_env_file "$MCP_ENV_FILE"

DB_NAME="${DB_NAME:-arcturus}"
DB_USER="${DB_USER:-arcturus_user}"
DB_PASSWORD="${DB_PASSWORD:-arcturus_pw}"
AUTO_AGENT_SYNC="${AUTO_AGENT_SYNC:-false}"
SYNC_FORWARD_USER_CHAT="${SYNC_FORWARD_USER_CHAT:-false}"
SYNC_POLL_MS="${SYNC_POLL_MS:-2000}"
SYNC_DONE_IDLE_MS="${SYNC_DONE_IDLE_MS:-4000}"
SYNC_OPERATOR_USERNAME="${SYNC_OPERATOR_USERNAME:-Systemaccount}"
SYNC_SPAWN_X="${SYNC_SPAWN_X:-5}"
SYNC_SPAWN_Y="${SYNC_SPAWN_Y:-5}"
SSH_TUNNEL_STRICT_HOST_KEY_CHECKING="${SSH_TUNNEL_STRICT_HOST_KEY_CHECKING:-accept-new}"
SSH_TUNNEL_CONNECT_TIMEOUT_SEC="${SSH_TUNNEL_CONNECT_TIMEOUT_SEC:-10}"
SSH_TUNNEL_START_TIMEOUT_MS="${SSH_TUNNEL_START_TIMEOUT_MS:-30000}"

printf "\nSelect setup mode:\n"
printf "  1) Local Docker hotel + MCP\n"
printf "  2) Remote hotel via SSH tunnel + MCP\n"
printf "  3) MCP only (direct host/ports)\n\n"

SETUP_MODE="$(prompt "Choose mode (1/2/3)" "1")"

MCP_API_KEY_DEFAULT="${MCP_API_KEY:-}"
if [ -z "$MCP_API_KEY_DEFAULT" ] || [ "$MCP_API_KEY_DEFAULT" = "change-me-to-a-secret" ]; then
  MCP_API_KEY_DEFAULT="$(generate_api_key)"
fi
MCP_API_KEY="$(prompt "MCP API key" "$MCP_API_KEY_DEFAULT")"
HABBO_BASE_URL="$(prompt "Habbo base URL" "${HABBO_BASE_URL:-http://127.0.0.1:1080}")"

case "$SETUP_MODE" in
  1)
    info "Configuring local Docker mode"
    HABBO_OWNER_OR_ORG="$(prompt "GHCR owner/org for images" "${HABBO_OWNER_OR_ORG:-tndejong}")"
    HABBO_PUBLIC_HOST="$(prompt "Public host for Nitro" "${HABBO_PUBLIC_HOST:-127.0.0.1}")"
    HABBO_PUBLIC_PROTOCOL="$(prompt "Public protocol (http/https)" "${HABBO_PUBLIC_PROTOCOL:-http}")"
    HABBO_NITRO_PORT="$(prompt "Host port for Nitro web" "${HABBO_NITRO_PORT:-1080}")"
    HABBO_GAME_PORT="$(prompt "Host port for Arcturus game" "${HABBO_GAME_PORT:-3000}")"
    HABBO_RCON_PORT="$(prompt "Host port for RCON" "${HABBO_RCON_PORT:-3001}")"
    HABBO_DB_PORT="$(prompt "Host port for MySQL" "${HABBO_DB_PORT:-13306}")"
    HABBO_DOCKER_SUBNET="$(prompt "Docker subnet" "${HABBO_DOCKER_SUBNET:-172.28.0.0/16}")"

    write_registry_env_local() {
      write_registry_env \
      "$HABBO_OWNER_OR_ORG" \
      "$HABBO_PUBLIC_HOST" \
      "$HABBO_PUBLIC_PROTOCOL" \
      "$HABBO_NITRO_PORT" \
      "$HABBO_GAME_PORT" \
      "$HABBO_RCON_PORT" \
      "$HABBO_DB_PORT" \
      "$HABBO_DOCKER_SUBNET"
    }
    safe_write_file "$REGISTRY_ENV_FILE" write_registry_env_local

    RCON_HOST="127.0.0.1"
    RCON_PORT="$HABBO_RCON_PORT"
    DB_HOST="127.0.0.1"
    DB_PORT="$HABBO_DB_PORT"
    SSH_TUNNEL_ENABLED="false"
    SSH_TUNNEL_HOST=""
    SSH_TUNNEL_PORT="22"
    SSH_TUNNEL_USER=""
    SSH_TUNNEL_KEY_PATH=""
    SSH_TUNNEL_LOCAL_RCON_PORT="43001"
    SSH_TUNNEL_REMOTE_RCON_HOST="127.0.0.1"
    SSH_TUNNEL_REMOTE_RCON_PORT="13001"
    SSH_TUNNEL_LOCAL_DB_PORT="43306"
    SSH_TUNNEL_REMOTE_DB_HOST="127.0.0.1"
    SSH_TUNNEL_REMOTE_DB_PORT="13306"
    ;;
  2)
    info "Configuring remote SSH tunnel mode"
    SSH_TUNNEL_ENABLED="true"
    SSH_TUNNEL_HOST="$(prompt "Remote SSH host" "${SSH_TUNNEL_HOST:-}")"
    SSH_TUNNEL_PORT="$(prompt "Remote SSH port" "${SSH_TUNNEL_PORT:-22}")"
    SSH_TUNNEL_USER="$(prompt "Remote SSH user" "${SSH_TUNNEL_USER:-root}")"
    SSH_TUNNEL_KEY_PATH="$(prompt "SSH private key path" "${SSH_TUNNEL_KEY_PATH:-$HOME/.ssh/id_rsa}")"
    SSH_TUNNEL_LOCAL_RCON_PORT="$(prompt "Local forwarded RCON port" "${SSH_TUNNEL_LOCAL_RCON_PORT:-43001}")"
    SSH_TUNNEL_REMOTE_RCON_HOST="$(prompt "Remote RCON host (from server)" "${SSH_TUNNEL_REMOTE_RCON_HOST:-127.0.0.1}")"
    SSH_TUNNEL_REMOTE_RCON_PORT="$(prompt "Remote RCON port (from server)" "${SSH_TUNNEL_REMOTE_RCON_PORT:-13001}")"
    SSH_TUNNEL_LOCAL_DB_PORT="$(prompt "Local forwarded DB port" "${SSH_TUNNEL_LOCAL_DB_PORT:-43306}")"
    SSH_TUNNEL_REMOTE_DB_HOST="$(prompt "Remote DB host (from server)" "${SSH_TUNNEL_REMOTE_DB_HOST:-127.0.0.1}")"
    SSH_TUNNEL_REMOTE_DB_PORT="$(prompt "Remote DB port (from server)" "${SSH_TUNNEL_REMOTE_DB_PORT:-13306}")"

    RCON_HOST="127.0.0.1"
    RCON_PORT="$SSH_TUNNEL_LOCAL_RCON_PORT"
    DB_HOST="127.0.0.1"
    DB_PORT="$SSH_TUNNEL_LOCAL_DB_PORT"
    ;;
  3)
    info "Configuring MCP-only direct mode"
    RCON_HOST="$(prompt "RCON host" "${RCON_HOST:-127.0.0.1}")"
    RCON_PORT="$(prompt "RCON port" "${RCON_PORT:-3001}")"
    DB_HOST="$(prompt "DB host" "${DB_HOST:-127.0.0.1}")"
    DB_PORT="$(prompt "DB port" "${DB_PORT:-13306}")"
    SSH_TUNNEL_ENABLED="false"
    SSH_TUNNEL_HOST=""
    SSH_TUNNEL_PORT="22"
    SSH_TUNNEL_USER=""
    SSH_TUNNEL_KEY_PATH=""
    SSH_TUNNEL_LOCAL_RCON_PORT="43001"
    SSH_TUNNEL_REMOTE_RCON_HOST="127.0.0.1"
    SSH_TUNNEL_REMOTE_RCON_PORT="13001"
    SSH_TUNNEL_LOCAL_DB_PORT="43306"
    SSH_TUNNEL_REMOTE_DB_HOST="127.0.0.1"
    SSH_TUNNEL_REMOTE_DB_PORT="13306"
    ;;
  *)
    fail "Invalid mode '$SETUP_MODE'. Choose 1, 2, or 3."
    ;;
esac

safe_write_file "$MCP_ENV_FILE" write_mcp_env

if [ ! -d "$MCP_DIR/node_modules" ]; then
  info "Installing MCP dependencies (first run)..."
  (cd "$MCP_DIR" && npm install)
  pass "Installed MCP dependencies"
else
  warn "Skipping npm install (node_modules already exists)"
fi

printf "\n"
HAS_JUST=false
if command -v just >/dev/null 2>&1; then
  HAS_JUST=true
fi

if [ "$SETUP_MODE" = "1" ]; then
  info "Local Docker next steps:"
  if [ "$HAS_JUST" = "true" ]; then
    printf "  1) just up\n"
    printf "  2) just doctor\n"
    printf "  3) (optional) just quick-start  # up + doctor\n"
  else
    printf "  1) docker compose --env-file .env.registry -f docker-compose.registry.yaml up -d\n"
    printf "  2) bash scripts/preflight.sh\n"
    printf "  3) bash scripts/smoke-test.sh\n"
  fi
  printf "  4) Open: %s?sso=123\n" "$HABBO_BASE_URL"
else
  info "MCP connectivity next steps:"
  if [ "$HAS_JUST" = "true" ]; then
    printf "  1) just preflight\n"
    printf "  2) just smoke\n"
  else
    printf "  1) bash scripts/preflight.sh\n"
    printf "  2) bash scripts/smoke-test.sh\n"
  fi
fi

print_client_snippet
printf "\n"
pass "Setup complete"
