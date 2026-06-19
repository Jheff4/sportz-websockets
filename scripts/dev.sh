#!/bin/bash

# =============================================================================
# start-dev.sh — Development startup script
# =============================================================================
# Starts the full local development stack in the correct order:
#   1. Validates your environment
#   2. Starts neon-local + the app via Docker Compose
#   3. Waits until the database is genuinely accepting connections
#   4. Runs Drizzle migrations against the ephemeral branch
#   5. Tails the combined logs so you can see everything in one terminal
#
# Usage:  ./start-dev.sh
# Stop:   Ctrl+C, then: docker compose -f docker-compose.dev.yml down
# =============================================================================

set -e  # exit immediately if any command fails

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Colour

info()    { echo -e "${BLUE}ℹ ${NC}$1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
error()   { echo -e "${RED}❌ $1${NC}"; }

echo ""
echo -e "${BLUE}🚀 Sportz — Development Stack${NC}"
echo "======================================"
echo ""

# ── Step 1: Check .env.development exists ──────────────────────────────────────
# Without this file the neon-local container won't have the API key it needs
# to contact Neon Cloud, and your app won't know which database to connect to.
info "Checking .env.development..."

if [ ! -f .env.development ]; then
  error ".env.development not found."
  echo "   Create it by filling in NEON_API_KEY, NEON_PROJECT_ID, PARENT_BRANCH_ID, and ARCJET_KEY."
  echo "   See DOCKER.md → Step 1 for where to find each value."
  exit 1
fi

# Warn if any placeholder values are still in the file.
# grep -q returns exit code 0 if found, 1 if not found.
if grep -q "your_neon_api_key_here\|your_neon_project_id_here\|your_parent_branch_id_here" .env.development; then
  error ".env.development still contains placeholder values."
  echo "   Open the file and replace every 'your_*_here' with a real value."
  exit 1
fi

success ".env.development looks good."

# ── Step 2: Check Docker is running ───────────────────────────────────────────
# 'docker info' succeeds only when the Docker daemon is reachable.
# Sending stderr to /dev/null keeps the error message off the screen.
info "Checking Docker..."

if ! docker info >/dev/null 2>&1; then
  error "Docker is not running."
  echo "   Start Docker Desktop and wait for it to fully launch, then re-run this script."
  exit 1
fi

success "Docker is running."

# ── Step 3: Create the .neon_local directory ──────────────────────────────────
# Neon Local stores branch metadata here, keyed by your current Git branch name.
# This lets it reuse the same ephemeral DB branch on container restarts instead
# of creating a brand-new one every single time.
# -p means "create parent directories if needed and don't error if it exists".
mkdir -p .neon_local
info "Branch metadata directory ready (.neon_local/)."

# ── Step 4: Start containers in detached mode ─────────────────────────────────
# -f           → which compose file to use
# up           → create and start containers
# --build      → rebuild the app image if any source files changed
# -d           → detached (run in background so this script can continue)
#
# We run detached here because we need to run migrations (step 5) AFTER the
# database is ready. If we didn't use -d, this command would block forever
# and we'd never reach the migration step.
echo ""
info "Starting Docker Compose stack (detached)..."
docker compose -f docker-compose.dev.yml up --build -d

# ── Step 5: Wait for neon-local to become healthy ─────────────────────────────
# docker-compose.dev.yml already has a healthcheck on neon-local, but that only
# controls when the *app container* starts. We also need to wait here before
# running migrations from your host machine.
#
# How this loop works:
#   - 'docker compose inspect' reads the container's health status
#   - We repeat every 3 seconds until the status is "healthy"
#   - MAX_WAIT caps total wait time so the script doesn't loop forever
echo ""
info "Waiting for neon-local to be healthy..."
info "(Neon Local needs to contact Neon Cloud and create your ephemeral branch — this takes ~15-30s)"

MAX_WAIT=120   # give up after 2 minutes
ELAPSED=0
INTERVAL=3

while true; do
  # 'docker inspect' returns a JSON array; we pull out the health status string.
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' sportz-neon-local 2>/dev/null || echo "not_found")

  if [ "$HEALTH" = "healthy" ]; then
    success "neon-local is healthy — ephemeral branch is ready."
    break
  fi

  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    error "Timed out waiting for neon-local after ${MAX_WAIT}s."
    echo "   Check the container logs for clues:"
    echo "   docker compose -f docker-compose.dev.yml logs neon-local"
    docker compose -f docker-compose.dev.yml down
    exit 1
  fi

  # Print a dot every 3 seconds so you know it's still working.
  printf "."
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

# ── Step 6: Run Drizzle migrations ────────────────────────────────────────────
# drizzle-kit runs on your HOST machine (not inside Docker) using the npm script
# defined in package.json. It needs DATABASE_URL to point at localhost:5432
# because from your host, "localhost" reaches the port that docker-compose.dev.yml
# maps out of the neon-local container.
#
# Note: this is DIFFERENT from the DATABASE_URL inside the Docker network, where
# the hostname is "sportz-neon-local" (the container name). Your host can't
# resolve that name — it only sees the mapped port on localhost.
#
# We also set DATABASE_SSL_REJECT_UNAUTHORIZED=false because Neon Local's
# TLS certificate is self-signed and the pg driver rejects it by default.
echo ""
info "Running Drizzle migrations against the ephemeral branch..."

DATABASE_URL="postgres://neon:npg@localhost:5432/neondb?sslmode=require" \
DATABASE_SSL_REJECT_UNAUTHORIZED=false \
npm run db:migrate

success "Migrations applied."

# ── Step 7: Tail the logs ─────────────────────────────────────────────────────
# Now that everything is up and migrated, attach to the live log stream.
# You'll see output from both the neon-local container and the app container
# interleaved, prefixed by service name.
#
# Press Ctrl+C to stop tailing. The containers keep running.
# To fully stop and destroy the ephemeral branch: docker compose -f docker-compose.dev.yml down
echo ""
success "Stack is up!"
echo ""
echo -e "  ${GREEN}API:${NC}       http://localhost:8000"
echo -e "  ${GREEN}WebSocket:${NC} ws://localhost:8000/ws"
echo -e "  ${GREEN}Database:${NC}  postgres://neon:npg@localhost:5432/neondb"
echo ""
echo -e "${YELLOW}Tailing logs (Ctrl+C to stop tailing — containers keep running):${NC}"
echo -e "${YELLOW}To fully shut down: docker compose -f docker-compose.dev.yml down${NC}"
echo ""

docker compose -f docker-compose.dev.yml logs -f
