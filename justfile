set windows-powershell := true

# Show all available recipes
default:
  @just --list

# Run interactive setup wizard
setup:
  bash setup.sh

# Validate env, ports, and network assumptions
preflight:
  bash scripts/preflight.sh

# Run end-to-end runtime smoke test
smoke:
  bash scripts/smoke-test.sh

# Run preflight + smoke test in sequence
doctor:
  bash scripts/preflight.sh && bash scripts/smoke-test.sh

# Fast path after setup (start stack + validate)
quick-start:
  just up && just doctor

# Start registry stack in background
up:
  docker compose --env-file .env.registry -f docker-compose.registry.yaml up -d

# Stop and remove registry stack
down:
  docker compose --env-file .env.registry -f docker-compose.registry.yaml down

# Restart running services
restart:
  docker compose --env-file .env.registry -f docker-compose.registry.yaml restart

# Show current service status
ps:
  docker compose --env-file .env.registry -f docker-compose.registry.yaml ps

# Tail Arcturus logs
logs-arcturus:
  docker compose --env-file .env.registry -f docker-compose.registry.yaml logs -f arcturus

# Tail Nitro logs
logs-nitro:
  docker compose --env-file .env.registry -f docker-compose.registry.yaml logs -f nitro

# Tail MySQL logs
logs-mysql:
  docker compose --env-file .env.registry -f docker-compose.registry.yaml logs -f mysql

# Install MCP server dependencies
mcp-install:
  cd habbo-mcp && npm install

# Run MCP server locally (dev)
mcp-dev:
  cd habbo-mcp && npx tsx src/index.ts

# Open MySQL shell in mysql container
mysql:
  docker exec -it mysql sh -lc "mysql -u arcturus_user -parcturus_pw arcturus"
