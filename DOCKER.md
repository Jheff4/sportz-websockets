# Docker Setup Guide — Sportz API

This guide explains how to run the Sportz API in Docker for both local development (using Neon Local) and production (using Neon Cloud directly).

---

## How it works — the big picture

```
┌───────────────────────────────────────────────────────┐
│                  DEVELOPMENT (local)                  │
│                                                       │
│  ┌─────────────┐    postgres://neon:npg@              │
│  │  sportz app │ ──── neon-local:5432/neondb ────┐    │
│  │  :8000      │                                 │    │
│  └─────────────┘                                 ▼    │
│                                          ┌─────────────┐  HTTPS  ┌──────────────────┐
│                                          │ neon-local  │ ──────▶ │  Neon Cloud      │
│                                          │ proxy :5432 │         │  (ephemeral      │
│                                          └─────────────┘         │   branch)        │
│                                                                  └──────────────────┘
└───────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                  PRODUCTION                           │
│                                                       │
│  ┌─────────────┐    postgres://user:pass@             │
│  │  sportz app │ ──── ep-xxx.neon.tech/neondb ──────▶ Neon Cloud
│  │  :8000      │    (direct — no proxy)               │
│  └─────────────┘                                      │
└──────────────────────────────────────────────────────┘
```

In **development**, a `neon-local` container sits between your app and Neon Cloud. It automatically creates a fresh, isolated database branch every time you `docker compose up` and deletes it when you `docker compose down`. Your app never touches the main branch.

In **production**, there is no proxy. `DATABASE_URL` points straight at Neon Cloud.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A [Neon](https://neon.tech) account with a project created
- An [Arcjet](https://arcjet.com) account

---

## Development — running locally with Neon Local

### Step 1 — Collect your Neon credentials

You need three values from the Neon Console:

| Value              | Where to find it                                                            |
| ------------------ | --------------------------------------------------------------------------- |
| `NEON_API_KEY`     | Account Settings → API Keys → **New API Key**                               |
| `NEON_PROJECT_ID`  | Project → Settings → General (looks like `ep-winter-king-abc123`)           |
| `PARENT_BRANCH_ID` | Project → Branches → click **main** → copy the ID (looks like `br-abc-123`) |

> **What is `PARENT_BRANCH_ID`?**
> Neon Local will fork a new temporary ("ephemeral") branch from this branch every time the container starts. Think of it like `git checkout -b my-feature main` but for your database. The branch is deleted automatically when you `docker compose down`.

### Step 2 — Set up your `.env.development`

The file `.env.development` already exists (it was created for you). Open it and fill in your real values:

```bash
# Open the file
code .env.development   # or nano, vim, etc.
```

Edit these four lines:

```env
NEON_API_KEY=your_actual_api_key
NEON_PROJECT_ID=your_actual_project_id
PARENT_BRANCH_ID=your_actual_branch_id
ARCJET_KEY=your_actual_arcjet_key
```

Leave everything else as-is.

### Step 3 — Start the stack

```bash
docker compose -f docker-compose.dev.yml up --build
```

What happens when you run this:

1. Docker builds your app image (installs deps, compiles TypeScript)
2. Docker pulls `neondatabase/neon_local:latest`
3. `neon-local` starts and contacts Neon Cloud → creates an ephemeral branch
4. Once `neon-local` is healthy (Postgres is accepting connections), your app starts
5. App connects to `neon-local:5432` inside the Docker network

You will see output like:

```
neon-local  | Branch created: br-dev-xyz-123
neon-local  | Listening on 0.0.0.0:5432
app         | Server running at http://localhost:8000
```

### Step 4 — Run database migrations

Migrations need to run against the ephemeral branch. Since `neon-local` exposes port 5432 to your host machine, you can run drizzle-kit from outside Docker:

```bash
# In a new terminal (while docker compose is running)
DATABASE_URL="postgres://neon:npg@localhost:5432/neondb?sslmode=require" \
DATABASE_SSL_REJECT_UNAUTHORIZED=false \
npm run db:migrate
```

Or add a one-liner to your shell:

```bash
# Shortcut — put this in your shell profile if you use it often
alias migrate-dev='DATABASE_URL="postgres://neon:npg@localhost:5432/neondb?sslmode=require" DATABASE_SSL_REJECT_UNAUTHORIZED=false npm run db:migrate'
```

### Step 5 — Make requests

```bash
# REST
curl http://localhost:8000/matches

# WebSocket
wscat -c ws://localhost:8000/ws
```

### Step 6 — Stop the stack

```bash
docker compose -f docker-compose.dev.yml down
```

The ephemeral database branch is deleted automatically on shutdown. Next time you `up`, a fresh branch is created.

> **Want to keep the branch between restarts?**
> Uncomment `DELETE_BRANCH: 'false'` in `docker-compose.dev.yml`.

---

## Production — deploying with Neon Cloud

### Step 1 — Create your `.env.production`

```bash
cp .env.production.example .env.production
```

Open `.env.production` and fill in your **real production values**:

```env
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require
ARCJET_KEY=ajkey_your_production_key
CORS_ORIGIN=https://your-frontend-domain.com
ARCJET_MODE=LIVE
API_URL=https://your-api-domain.com
```

Get `DATABASE_URL` from: Neon Console → your project → **Connect** → _Connection string_ (choose the **pooled** endpoint for production).

> `.env.production` is git-ignored. **Never commit it.**

### Step 2 — Run migrations against production

Run this once before deploying, or as part of your CI pipeline:

```bash
DATABASE_URL="your_production_url" npm run db:migrate
```

### Step 3 — Start the production container

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

The `-d` flag runs it detached (in the background).

```bash
# Check it's running
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f app

# Stop
docker compose -f docker-compose.prod.yml down
```

### Deploying to a cloud platform (recommended)

For a real production deployment, build and push the image to a registry, then deploy from there:

```bash
# Build the image
docker build -t your-registry/sportz:latest .

# Push to Docker Hub (or GHCR, ECR, etc.)
docker push your-registry/sportz:latest
```

Then deploy on:

- **Railway** — connect your repo, set environment variables in the dashboard
- **Fly.io** — `fly launch`, then `fly secrets set DATABASE_URL=...`
- **Render** — create a Web Service, paste environment variables in the UI

---

## Environment variable reference

| Variable                           | Dev value                                                    | Prod value                 | Description                                                                      |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | `postgres://neon:npg@neon-local:5432/neondb?sslmode=require` | Your Neon Cloud pooled URL | Database connection string                                                       |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false`                                                      | `true` (or unset)          | Whether to validate TLS certs. Must be `false` for Neon Local's self-signed cert |
| `NODE_ENV`                         | `development`                                                | `production`               | Affects logging format and Morgan output                                         |
| `PORT`                             | `8000`                                                       | `8000`                     | HTTP port                                                                        |
| `CORS_ORIGIN`                      | `http://localhost:3000`                                      | Your frontend URL          | Allowed CORS origins                                                             |
| `ARCJET_KEY`                       | Your dev key                                                 | Your prod key              | Arcjet API key                                                                   |
| `ARCJET_MODE`                      | `DRY_RUN`                                                    | `LIVE`                     | `DRY_RUN` logs decisions without blocking                                        |
| `NEON_API_KEY`                     | Your key                                                     | _(not used)_               | Used by `neon-local` container only                                              |
| `NEON_PROJECT_ID`                  | Your project ID                                              | _(not used)_               | Used by `neon-local` container only                                              |
| `PARENT_BRANCH_ID`                 | Your main branch ID                                          | _(not used)_               | Branch to fork ephemeral branches from                                           |

---

## How `DATABASE_URL` switches between dev and prod

There is no magic — it is just a different value of the same environment variable:

```
Development:  DATABASE_URL = postgres://neon:npg@neon-local:5432/neondb?sslmode=require
                                              ↑
                                    Docker service name (hostname inside the network)

Production:   DATABASE_URL = postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
                                                    ↑
                                             Neon Cloud host
```

The app code (`src/db/db.ts`) reads `DATABASE_URL` from the environment. It does not know or care where the database lives — you control that entirely by which `.env` file you provide.

---

## File overview

```
sportz/
├── Dockerfile                  Two-stage build: builder → lean runner image
├── .dockerignore               Excludes node_modules, .env files, logs from image
├── docker-compose.dev.yml      Dev: app + neon-local proxy
├── docker-compose.prod.yml     Prod: app only, direct Neon Cloud connection
├── .env.development            Your dev secrets (git-ignored, fill this in)
├── .env.production.example     Committed template — copy to .env.production
├── .env.production             Your prod secrets (git-ignored, never commit)
└── src/db/db.ts                Reads DATABASE_SSL_REJECT_UNAUTHORIZED to
                                handle self-signed certs in dev
```

---

## Common issues

### `neon-local` container fails to start

**Symptom:** `Error: NEON_API_KEY is required`  
**Fix:** Make sure `.env.development` has your real `NEON_API_KEY`, `NEON_PROJECT_ID`, and `PARENT_BRANCH_ID`.

### App starts before the database is ready

**Symptom:** `ECONNREFUSED` on startup  
**Fix:** `docker-compose.dev.yml` already handles this with `depends_on: condition: service_healthy`. If it still happens, increase `start_period` in the `healthcheck` of the `neon-local` service.

### `SSL SYSCALL error` or certificate errors

**Symptom:** SSL handshake errors in the app  
**Fix:** Make sure `.env.development` has `DATABASE_SSL_REJECT_UNAUTHORIZED=false`. Also make sure `docker-compose.dev.yml` is passing this variable to the `app` service (it does, under `environment:`).

### `pg_isready: command not found` in healthcheck

**Symptom:** Healthcheck errors in `neon-local`  
**Fix:** Replace the healthcheck test in `docker-compose.dev.yml` with a TCP probe:

```yaml
test: ['CMD-SHELL', 'timeout 1 bash -c "cat < /dev/null > /dev/tcp/localhost/5432"']
```

### Migrations fail with `relation does not exist`

**Fix:** Run migrations before starting the app, or run them while the app is running:

```bash
DATABASE_URL="postgres://neon:npg@localhost:5432/neondb?sslmode=require" \
DATABASE_SSL_REJECT_UNAUTHORIZED=false \
npm run db:migrate
```
