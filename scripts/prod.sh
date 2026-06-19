#!/bin/bash

# =============================================================================
# scripts/prod.sh — Production deployment script
# =============================================================================
# Starts the Sportz API in production mode, connected directly to Neon Cloud.
# There is NO Neon Local proxy here — the app talks to Neon Cloud via the
# DATABASE_URL stored in .env.production.
#
# Order of operations:
#   1. Validate .env.production exists and is filled in
#   2. Check Docker is running
#   3. Run Drizzle migrations against Neon Cloud (BEFORE the container starts)
#   4. Build and start the production container (detached)
#   5. Poll until the app is responding
#
# Usage:
#   chmod +x scripts/prod.sh   # first time only
#   ./scripts/prod.sh
#
# Stop:
#   docker compose -f docker-compose.prod.yml down
# =============================================================================

set -e  # exit immediately if any command fails

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}ℹ ${NC}$1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
error()   { echo -e "${RED}❌ $1${NC}"; }

echo ""
echo -e "${BLUE}🚀 Sportz — Production Deployment${NC}"
echo "======================================="
echo ""

# ── Step 1: Check .env.production exists and is filled in ────────────────────
info "Checking .env.production..."

if [ ! -f .env.production ]; then
  error ".env.production not found."
  echo "   Run:  cp .env.production.example .env.production"
  echo "   Then fill in your real Neon Cloud DATABASE_URL, ARCJET_KEY, etc."
  exit 1
fi

# Guard against deploying with unfilled placeholder values from the example file.
# grep -q is silent — it returns exit code 0 if the pattern is found.
if grep -q "your_production_key\|your-frontend-domain\|ep-xxx\|your-api-domain" .env.production; then
  error ".env.production still contains placeholder values."
  echo "   Open the file and replace every placeholder with a real production value."
  exit 1
fi

success ".env.production looks good."

# ── Step 2: Check Docker is running ───────────────────────────────────────────
info "Checking Docker..."

if ! docker info >/dev/null 2>&1; then
  error "Docker is not running."
  echo "   Start Docker Desktop and try again."
  exit 1
fi

success "Docker is running."

# ── Step 3: Run migrations against Neon Cloud ─────────────────────────────────
# Migrations run BEFORE the container starts so the schema is in place the
# moment the app connects for the first time.
#
# Why not just `npm run db:migrate` on its own?
# drizzle.config.ts uses `import 'dotenv/config'` which loads `.env` by default
# — NOT `.env.production`. Running the command bare would migrate against
# whatever DATABASE_URL is in your local `.env` file (your dev database).
#
# Instead, we extract DATABASE_URL from .env.production and set it inline so
# drizzle-kit uses the right production database for this one command only.
#
# How the extraction works:
#   grep '^DATABASE_URL='  → find the line that starts with DATABASE_URL=
#   cut -d '=' -f2-        → strip "DATABASE_URL=" and keep everything after it.
#                            -f2- (not -f2) handles URLs that contain = signs
#                            in their query parameters (e.g. channel_binding=require).
echo ""
info "Running Drizzle migrations against Neon Cloud..."
warn "This will apply schema changes to your PRODUCTION database."
echo ""

PROD_DB_URL=$(grep '^DATABASE_URL=' .env.production | cut -d '=' -f2-)

if [ -z "$PROD_DB_URL" ]; then
  error "DATABASE_URL is missing or empty in .env.production."
  exit 1
fi

DATABASE_URL="$PROD_DB_URL" npm run db:migrate

success "Migrations applied to Neon Cloud."

# ── Step 4: Build and start the production container ─────────────────────────
# --build  → rebuild the app image if source files changed since last deploy
# -d       → detached (run in background — we need to poll for readiness below)
#
# Unlike the dev setup, there is no neon-local service here. The container
# connects directly to Neon Cloud using the DATABASE_URL from .env.production.
# No waiting for a proxy, no ephemeral branches — just the app and Neon Cloud.
echo ""
info "Building and starting production container (detached)..."

docker compose -f docker-compose.prod.yml up --build -d

# ── Step 5: Confirm the app is responding ─────────────────────────────────────
# The container starting doesn't mean the Node process is ready. We poll the
# root endpoint until it returns an HTTP 2xx or we give up after 60 seconds.
#
# curl flags:
#   -s           → silent (suppresses the progress bar)
#   -f           → fail silently on HTTP errors (4xx/5xx return a non-zero exit code)
#   -o /dev/null → throw away the response body — we only care about the exit code
echo ""
info "Waiting for the app to respond..."

MAX_WAIT=60
ELAPSED=0
INTERVAL=3

while true; do
  if curl -sf -o /dev/null http://localhost:8000/; then
    break
  fi

  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    error "App did not respond after ${MAX_WAIT}s."
    echo "   Check the container logs for clues:"
    echo "   docker compose -f docker-compose.prod.yml logs app"
    exit 1
  fi

  printf "."
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "Production deployment complete!"
echo ""
echo -e "  ${GREEN}API:${NC}       http://localhost:8000"
echo -e "  ${GREEN}WebSocket:${NC} ws://localhost:8000/ws"
echo -e "  ${GREEN}Database:${NC}  Neon Cloud (DATABASE_URL in .env.production)"
echo ""
echo "Useful commands:"
echo "  View logs:  docker compose -f docker-compose.prod.yml logs -f app"
echo "  Status:     docker compose -f docker-compose.prod.yml ps"
echo "  Stop:       docker compose -f docker-compose.prod.yml down"
