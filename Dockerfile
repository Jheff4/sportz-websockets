# =============================================================================
# Dockerfile — Sportz API
# =============================================================================
#
# Two-stage build:
#   Stage 1 (builder) — installs ALL dependencies, compiles TypeScript → dist/
#   Stage 2 (runner)  — copies only the compiled JS + production dependencies.
#                       The final image has no TypeScript compiler, no devDeps,
#                       and no source files — keeping it small and secure.
#
# Build:  docker build -t sportz .
# Run:    docker run -p 8000:8000 --env-file .env.production sportz
# =============================================================================


# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests first.
# Docker caches this layer — npm ci only reruns when package*.json changes.
COPY package*.json ./

# Install everything (devDependencies included — we need tsc to compile).
RUN npm ci

# Copy TypeScript config and source files.
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript → dist/
RUN npm run build


# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install ONLY production dependencies (no tsc, no tsx, no eslint, etc.)
RUN npm ci --omit=dev

# Copy the compiled output from the builder stage.
# We only ship dist/ — source files never enter this image.
COPY --from=builder /app/dist ./dist

# Create a non-root user.
# Running as root inside a container is a security risk — this limits blast radius.
RUN addgroup -S sportz && adduser -S sportz -G sportz

# Create directories the app writes to at runtime, and hand them to the
# non-root user BEFORE switching to it.
#
# WHY THIS IS NEEDED: everything copied via COPY above is owned by root.
# logger.ts creates 'logs/error.log' and 'logs/combined.log' via Winston's
# File transport whenever NODE_ENV !== 'production'. Without this chown, the
# 'sportz' user has no write permission on /app, so winston's mkdir('logs')
# throws EACCES the instant the process starts, crashing it immediately. With
# restart: unless-stopped in docker-compose.dev.yml, that crash becomes an
# infinite restart loop — exactly what was happening before this fix.
RUN mkdir -p logs && chown -R sportz:sportz /app

USER sportz

# Document which port the app uses (does not publish it — that's docker run / compose).
EXPOSE 8000

# Start the compiled server.
CMD ["node", "dist/index.js"]
