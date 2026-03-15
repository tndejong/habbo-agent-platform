#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "========================================"
echo "  Habbo Agent Emulator — MCP Setup"
echo "========================================"
echo ""

# ── 1. Check prerequisites ──────────────────────────────────────────────────
echo "Checking prerequisites..."

MISSING=()
for cmd in docker node npm; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "  ✓ $cmd found"
  else
    echo "  ✗ $cmd not found"
    MISSING+=("$cmd")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo "ERROR: Missing required tools: ${MISSING[*]}"
  echo ""
  echo "Install guide:"
  echo "  docker : https://www.docker.com/products/docker-desktop/"
  echo "  node   : https://nodejs.org/ (or: brew install node)"
  echo "  npm    : included with Node.js"
  exit 1
fi

# Check Node version >= 18
NODE_VERSION=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js 18+ required (found $NODE_VERSION)"
  exit 1
fi
echo "  ✓ Node.js $NODE_VERSION"
echo ""

# ── 2. Prompt for configuration ─────────────────────────────────────────────
echo "Configuration:"
echo ""

API_KEY=$(openssl rand -hex 16 2>/dev/null || node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")
echo "  Auto-generated MCP API key: $API_KEY"
echo ""

read -rp "  Habbo base URL [http://127.0.0.1:1080]: " BASE_URL
BASE_URL="${BASE_URL:-http://127.0.0.1:1080}"
echo ""

# ── 3. Write habbo-mcp/.env ──────────────────────────────────────────────────
MCP_DIR="$SCRIPT_DIR/habbo-mcp"
ENV_FILE="$MCP_DIR/.env"

cat > "$ENV_FILE" <<EOF
RCON_HOST=127.0.0.1
RCON_PORT=3001
DB_HOST=127.0.0.1
DB_PORT=13306
DB_NAME=arcturus
DB_USER=arcturus_user
DB_PASSWORD=arcturus_pw
MCP_API_KEY=$API_KEY
HABBO_BASE_URL=$BASE_URL
AUTO_AGENT_SYNC=false
SYNC_FORWARD_USER_CHAT=false
SYNC_POLL_MS=2000
SYNC_DONE_IDLE_MS=4000
EOF
echo "✓ habbo-mcp/.env written"
echo ""
echo "  Your MCP API key: $API_KEY"
echo "  (saved in habbo-mcp/.env — run 'grep MCP_API_KEY habbo-mcp/.env' to retrieve it later)"

# ── 4. Patch rcon.allowed in config.ini ─────────────────────────────────────
# Covers: loopback, common Docker bridge IPs (Linux), Docker Desktop macOS/Windows
RCON_ALLOWED="127.0.0.1;172.17.0.1;172.18.0.1;172.19.0.1;192.168.65.1;192.168.64.1"
CONFIG="$SCRIPT_DIR/emulator/emulator/config.ini"

if [ -f "$CONFIG" ]; then
  if grep -q "^rcon.allowed=" "$CONFIG"; then
    # macOS-compatible sed (no -i without backup extension)
    sed -i.bak "s|^rcon.allowed=.*|rcon.allowed=$RCON_ALLOWED|" "$CONFIG"
    rm -f "${CONFIG}.bak"
  else
    echo "rcon.allowed=$RCON_ALLOWED" >> "$CONFIG"
  fi
  echo "✓ rcon.allowed updated in emulator/emulator/config.ini"
else
  echo "⚠ config.ini not found at $CONFIG — skipping RCON patch"
  echo "  You may need to manually add: rcon.allowed=$RCON_ALLOWED"
fi

# ── 5. npm install ───────────────────────────────────────────────────────────
echo ""
echo "Installing MCP server dependencies..."
cd "$MCP_DIR"
npm install --silent
echo "✓ Dependencies installed"

# ── 6. Print Claude Code config snippet ──────────────────────────────────────
MCP_ENTRY="$MCP_DIR/src/index.ts"

echo ""
echo "========================================"
echo "  Add to ~/.claude/settings.json"
echo "========================================"
echo ""
cat <<JSON
{
  "mcpServers": {
    "habbo": {
      "command": "npx",
      "args": ["tsx", "$MCP_ENTRY"],
      "env": {
        "MCP_API_KEY": "$API_KEY",
        "RCON_HOST": "127.0.0.1",
        "RCON_PORT": "3001",
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "13306",
        "DB_NAME": "arcturus",
        "DB_USER": "arcturus_user",
        "DB_PASSWORD": "arcturus_pw",
        "HABBO_BASE_URL": "$BASE_URL",
        "AUTO_AGENT_SYNC": "false",
        "SYNC_FORWARD_USER_CHAT": "false",
        "SYNC_POLL_MS": "2000",
        "SYNC_DONE_IDLE_MS": "4000"
      }
    }
  }
}
JSON

echo ""
echo "========================================"
echo "  Next Steps"
echo "========================================"
echo ""
echo "  1. Copy the mcpServers block above into ~/.claude/settings.json"
echo "     (merge with existing content if you already have other MCP servers)"
echo ""

if [ -d "$SCRIPT_DIR/emulator" ]; then
  echo "  2. Start the hotel (if not already running):"
  echo "       cd emulator && just start-all"
  echo "     First run takes ~5-10 minutes to build."
  echo ""
  echo "  3. Open the hotel: $BASE_URL?sso=123"
  echo ""
fi

echo "  4. Restart Claude Code and run: /mcp"
echo "     You should see 'habbo' listed with MCP tools."
echo ""
echo "Done! Your Habbo MCP server is ready."
echo ""
