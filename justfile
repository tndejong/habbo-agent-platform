set windows-powershell := true
compose_local := "docker compose --env-file .env.registry -f docker-compose.registry.yaml -f docker-compose.local.yaml"
compose_registry := "docker compose --env-file .env.registry -f docker-compose.registry.yaml"

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
  {{compose_local}} up -d

# Start image-only stack (production style)
up-registry:
  {{compose_registry}} up -d

# Stop and remove registry stack
down:
  {{compose_local}} down

# Stop and remove image-only stack
down-registry:
  {{compose_registry}} down

# Restart running services
restart:
  {{compose_local}} restart

# Show current service status
ps:
  {{compose_local}} ps

# Tail Arcturus logs
logs-arcturus:
  {{compose_local}} logs -f arcturus

# Tail Nitro logs
logs-nitro:
  {{compose_local}} logs -f nitro

# Tail MySQL logs
logs-mysql:
  {{compose_local}} logs -f mysql

# Tail Agent Portal logs
logs-portal:
  {{compose_local}} logs -f agent-portal

# Install MCP server dependencies
mcp-install:
  cd habbo-mcp && npm install

# Run MCP server locally (dev)
mcp-dev:
  cd habbo-mcp && npx tsx src/index.ts

# Open MySQL shell in mysql container
mysql:
  docker exec -it mysql sh -lc "mysql -u arcturus_user -parcturus_pw arcturus"
