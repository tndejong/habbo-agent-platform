#!/bin/sh
set -e

MCP_URL="${HABBO_MCP_URL:-http://habbo-mcp:3003/mcp}"
MCP_KEY="${MCP_API_KEY:-}"
ATLASSIAN_TOKEN="${ATLASSIAN_API_TOKEN:-}"
PROJECT_DIR="/tmp/agent-project"
MCP_JSON="$PROJECT_DIR/.mcp.json"

# Create writable project dir and copy agents from read-only volume
mkdir -p "$PROJECT_DIR/agents"
cp -r /project/agents/. "$PROJECT_DIR/agents/" 2>/dev/null || true

echo "[entrypoint] Writing MCP config → $MCP_JSON"
echo "[entrypoint] hotel-mcp URL: $MCP_URL"

cat > "$MCP_JSON" << EOF
{
  "mcpServers": {
    "hotel-mcp": {
      "type": "http",
      "url": "$MCP_URL",
      "headers": {
        "Authorization": "Bearer $MCP_KEY"
      }
    },
    "atlassian": {
      "type": "http",
      "url": "https://mcp.atlassian.com/v1/mcp",
      "headers": {
        "Authorization": "Basic $ATLASSIAN_TOKEN"
      }
    }
  }
}
EOF

echo "[entrypoint] MCP config written. Project dir: $PROJECT_DIR"
export HABBO_PROJECT_DIR="$PROJECT_DIR"
exec bun run /app/src/server.ts
